/**
 * Persistence port for the Harness: all Postgres writes the agent execution
 * path needs, in one injectable object (keeps loop/harness logic DB-agnostic
 * at the type level while this implementation binds them to Drizzle).
 */

import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@openlobster/db";
import {
  agentRuns,
  agentTasks,
  fileChanges,
  messages as messagesTable,
  toolCalls,
  toolResults,
  usageRecords,
} from "@openlobster/db/schema";
import type { RunStatus } from "@openlobster/types";
import { assertTransition, isTerminal } from "./state";

export class RunPersistence {
  constructor(private readonly db: Db) {}

  // --- Run lifecycle -----------------------------------------------------

  /**
   * Atomically claim a run: acquire/refresh lease + transition to starting.
   * Returns false when another worker owns a live lease.
   */
  async claimRun(input: {
    runId: string;
    workerId: string;
    leaseSeconds: number;
    model?: string;
    provider?: string;
  }): Promise<boolean> {
    const rows = await this.db
      .update(agentRuns)
      .set({
        status: "starting",
        workerId: input.workerId,
        leaseOwner: input.workerId,
        leaseExpiresAt: sql`now() + (${input.leaseSeconds} * interval '1 second')`,
        heartbeatAt: sql`now()`,
        startedAt: sql`coalesce(${agentRuns.startedAt}, now())`,
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(agentRuns.id, input.runId),
          sql`(${agentRuns.leaseOwner} IS NULL OR ${agentRuns.leaseExpiresAt} < now())`,
          sql`${agentRuns.status} IN ('queued', 'starting', 'paused')`,
        ),
      )
      .returning({ id: agentRuns.id });
    return rows.length > 0;
  }

  async renewLease(runId: string, workerId: string, leaseSeconds: number): Promise<boolean> {
    const rows = await this.db
      .update(agentRuns)
      .set({
        leaseExpiresAt: sql`now() + (${leaseSeconds} * interval '1 second')`,
        heartbeatAt: sql`now()`,
      })
      .where(and(eq(agentRuns.id, runId), eq(agentRuns.leaseOwner, workerId)))
      .returning({ id: agentRuns.id });
    return rows.length > 0;
  }

  async releaseLease(runId: string, workerId: string): Promise<void> {
    await this.db
      .update(agentRuns)
      .set({ leaseOwner: null, leaseExpiresAt: null })
      .where(and(eq(agentRuns.id, runId), eq(agentRuns.leaseOwner, workerId)));
  }

  /** Status transition validated against the state machine; no-op if terminal target reached already. */
  async setStatus(input: {
    runId: string;
    from: RunStatus | readonly RunStatus[];
    to: RunStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    const current = await this.getStatus(input.runId);
    if (current === null || isTerminal(current)) return;
    assertTransition(current, input.to);

    await this.db
      .update(agentRuns)
      .set({
        status: input.to,
        ...(input.to === "completed" || input.to === "failed" ||
          input.to === "cancelled" || input.to === "timeout"
          ? { completedAt: sql`now()` }
          : {}),
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        updatedAt: sql`now()`,
      })
      .where(eq(agentRuns.id, input.runId));
  }

  async getStatus(runId: string): Promise<RunStatus | null> {
    const [row] = await this.db
      .select({ status: agentRuns.status })
      .from(agentRuns)
      .where(eq(agentRuns.id, runId))
      .limit(1);
    return (row?.status as RunStatus | undefined) ?? null;
  }

  async setTaskStatus(taskId: string, status: string): Promise<void> {
    await this.db.update(agentTasks).set({ status }).where(eq(agentTasks.id, taskId));
  }

  // --- Messages ----------------------------------------------------------

  async appendMessage(input: {
    sessionId: string;
    runId?: string | null;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(messagesTable).values({
      sessionId: input.sessionId,
      runId: input.runId ?? null,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {},
    });
  }

  // --- Tool calls / results / file changes --------------------------------

  async createToolCall(input: {
    runId: string;
    sessionId: string;
    toolName: string;
    args: Record<string, unknown>;
  }): Promise<string> {
    const [row] = await this.db
      .insert(toolCalls)
      .values({
        runId: input.runId,
        sessionId: input.sessionId,
        toolName: input.toolName,
        arguments: input.args,
        status: "pending",
      })
      .returning({ id: toolCalls.id });
    return row!.id;
  }

  async completeToolCall(
    toolCallId: string,
    input: {
      status: "pending" | "running" | "completed" | "failed" | "denied";
      error?: string | null;
      resultData?: Record<string, unknown> | null;
      exitCode?: number | null;
      stdout?: string | null;
      stderr?: string | null;
    },
  ): Promise<void> {
    await this.db
      .update(toolCalls)
      .set({
        status: input.status,
        error: input.error ?? null,
        ...(["completed", "failed", "denied"].includes(input.status)
          ? { completedAt: sql`now()` }
          : {}),
        ...(input.status === "running"
          ? { startedAt: sql`coalesce(${toolCalls.startedAt}, now())` }
          : {}),
      })
      .where(eq(toolCalls.id, toolCallId));

    const wantsResultRow =
      input.resultData !== undefined &&
      ["completed", "failed"].includes(input.status);
    if (wantsResultRow && input.resultData !== undefined) {
      await this.db.insert(toolResults).values({
        toolCallId,
        result: input.resultData,
        exitCode: input.exitCode ?? null,
        stdout: input.stdout ?? null,
        stderr: input.stderr ?? null,
      }).onConflictDoNothing();
    }
  }

  async recordFileChange(input: {
    runId: string;
    workspaceId: string;
    path: string;
    operation: "create" | "update" | "delete" | "rename";
    beforeHash: string | null;
    afterHash: string | null;
    additions: number;
    deletions: number;
    diff: string | null;
  }): Promise<void> {
    await this.db.insert(fileChanges).values({
      runId: input.runId,
      workspaceId: input.workspaceId,
      path: input.path,
      operation: input.operation,
      beforeHash: input.beforeHash,
      afterHash: input.afterHash,
      additions: input.additions,
      deletions: input.deletions,
      diff: input.diff,
    });
  }

  // --- Usage --------------------------------------------------------------

  async recordUsage(input: {
    userId: string;
    organizationId: string;
    runId: string;
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    inputCostUsd: number;
    outputCostUsd: number;
  }): Promise<void> {
    await this.db.insert(usageRecords).values({
      userId: input.userId,
      organizationId: input.organizationId,
      runId: input.runId,
      model: input.model,
      provider: input.provider,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.inputTokens + input.outputTokens,
      inputCost: input.inputCostUsd.toFixed(8),
      outputCost: input.outputCostUsd.toFixed(8),
      totalCost: (input.inputCostUsd + input.outputCostUsd).toFixed(8),
    });
  }
}
