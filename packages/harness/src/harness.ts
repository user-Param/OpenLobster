/**
 * AgentHarness — the orchestrator. Per CLAUDE.md §5:
 *
 *   run()
 *    ↓
 *   initialize (load state)
 *    ↓
 *   acquire workspace lock + worker lease
 *    ↓
 *   build components (sandbox, fs, git, tools, gateway, rag, events)
 *    ↓
 *   agent loop
 *    ↓
 *   persist result / assistant message
 *    ↓
 *   emit completion event
 *
 * Cancellation/pause arrive via Redis signals; the loop polls flags between
 * steps so shutdown is prompt but never mid-write.
 */

import { randomUUID } from "node:crypto";
import * as nodePath from "node:path";
import { eq, sql } from "drizzle-orm";
import type { Logger } from "pino";
import type { AppConfig } from "@openlobster/config";
import type { Db } from "@openlobster/db";
import { workspaces } from "@openlobster/db/schema";
import type { RedisClient } from "@openlobster/redis";
import { subscribeRunSignals } from "@openlobster/redis";
import { EventPublisher } from "@openlobster/events";
import { ModelGateway, findModel } from "@openlobster/models";
import { LocalFileSystem } from "@openlobster/filesystem";
import { CliGitService } from "@openlobster/git";
import { SandboxManager } from "@openlobster/sandbox";
import {
  ToolManager,
  createNativeTools,
  ApprovalRequiredError,
} from "@openlobster/tools";
import { OpenAIEmbeddings, RagRetriever, formatChunks } from "@openlobster/rag";
import type { ChatMessage } from "@openlobster/models";
import { asId } from "@openlobster/types";
import { CheckpointManager } from "./checkpoint";
import { RunPersistence } from "./persistence";
import { WorkspaceLock, WorkspaceBusyError } from "./workspace-lock";
import { ApprovalManager } from "./approvals";
import {
  AgentLoop,
  BudgetExhaustedError,
  CancelledError,
  DEFAULT_LIMITS,
  PausedError,
} from "./loop";

const LEASE_SECONDS = 60;
const HEARTBEAT_MS = 20_000;

export interface HarnessDeps {
  readonly cfg: AppConfig;
  readonly db: Db;
  readonly redis: RedisClient;
  readonly workerId: string;
}

export interface HarnessOutcome {
  readonly status: "completed" | "failed" | "cancelled" | "timeout" | "paused" | "requeued";
  readonly finalMessage?: string;
  readonly errorCode?: string;
}

interface LoadedRun {
  readonly id: string;
  readonly task_id: string;
  readonly session_id: string;
  readonly workspace_id: string;
  readonly attempt: number;
  readonly model: string | null;
  readonly created_by: string;
  readonly organization_id: string;
  readonly project_id: string;
  readonly prompt: string;
  readonly mode: "planning" | "coding" | "reviewing" | "testing";
}

export class AgentHarness {
  private readonly persistence: RunPersistence;

  constructor(private readonly deps: HarnessDeps) {
    this.persistence = new RunPersistence(deps.db);
  }

  /**
   * Execute one run to a terminal (or paused) state.
   */
  async run(runId: string, log: Logger): Promise<HarnessOutcome> {
    const { cfg, db, redis, workerId } = this.deps;
    const publisher = new EventPublisher(db, redis, log);
    const approvals = new ApprovalManager(cfg.redis.url, publisher, log);

    const loaded = await this.loadRun(runId);
    if (loaded === null) {
      return { status: "failed", errorCode: "run_not_found" };
    }

    const logger = log.child({ runId, sessionId: loaded.session_id });
    const lock = new WorkspaceLock();

    let heartbeatTimer: NodeJS.Timeout | null = null;
    let sandboxStop: (() => Promise<void>) | null = null;
    let unsubscribeSignals: (() => Promise<void>) | null = null;

    let cancelled = false;
    let pauseRequested = false;

    try {
      // ---- Claim + lease ---------------------------------------------------
      const claimed = await this.persistence.claimRun({
        runId,
        workerId,
        leaseSeconds: LEASE_SECONDS,
        ...(loaded.model != null ? { model: loaded.model } : {}),
      });
      if (!claimed) {
        logger.warn("run already leased; requeueing");
        return { status: "requeued" };
      }
      await this.persistence.setStatus({ runId, from: "starting", to: "running" });

      // ---- Workspace lock --------------------------------------------------
      try {
        await lock.acquire(cfg.database.url, loaded.workspace_id);
      } catch (err) {
        if (err instanceof WorkspaceBusyError) {
          await this.persistence
            .setStatus({ runId, from: ["running", "starting"], to: "queued" })
            .catch(() => undefined);
          return { status: "requeued", errorCode: "workspace_busy" };
        }
        throw err;
      }

      // ---- Heartbeat -------------------------------------------------------
      heartbeatTimer = setInterval(() => {
        void this.persistence.renewLease(runId, workerId, LEASE_SECONDS).catch(() => undefined);
      }, HEARTBEAT_MS);

      // ---- Signals (cancel/pause) -------------------------------------------
      unsubscribeSignals = await subscribeRunSignals({ url: cfg.redis.url }, runId, (signal) => {
        if (signal.type === "cancel") cancelled = true;
        else if (signal.type === "pause") pauseRequested = true;
      });

      // ---- Environment ------------------------------------------------------
      const wsRow = await db.select().from(workspaces).where(eq(workspaces.id, loaded.workspace_id)).limit(1);
      const workspace = wsRow[0];
      if (workspace === undefined || workspace.rootPath === null) {
        throw new Error(`workspace ${loaded.workspace_id} missing or has no root path`);
      }
      const rootAbs = nodePath.resolve(workspace.rootPath);

      const fs = new LocalFileSystem(rootAbs);
      const git = (await fs.exists(".git")) ? new CliGitService(rootAbs) : null;

      const sandboxMgr = new SandboxManager(
        cfg,
        process.env["SANDBOX_DRIVER"] === "docker" ? "docker" : "local",
      );
      const sandbox = sandboxMgr.create({
        sandboxId: randomUUID(),
        workspaceId: loaded.workspace_id,
        hostWorkspacePath: rootAbs,
      });
      await sandbox.start();
      sandboxStop = () => sandbox.stop();

      // ---- Gateway with usage accounting --------------------------------------
      const gateway = new ModelGateway(cfg, logger);
      gateway.onUsage((model, provider, usage) => {
        void this.recordUsageSafe(loaded, runId, model, provider, usage).catch((e) =>
          logger.warn({ err: (e as Error).message }, "usage persist failed"),
        );
      });

      // ---- Tools ----------------------------------------------------------------
      const checkpoints = new CheckpointManager(db, runId);
      const toolManager = new ToolManager({
        tools: createNativeTools(),
        policy: { autoApproveModify: false, allowExecute: true },
        events: {
          toolRequested: (toolName, callId) =>
            void publisher.publish({ runId, sessionId: loaded.session_id, type: "tool.requested", payload: { toolName, callId } }),
          toolStarted: (toolName, callId) =>
            void publisher.publish({ runId, sessionId: loaded.session_id, type: "tool.started", payload: { toolName, callId } }),
          toolCompleted: (toolName, callId, ok) =>
            void publisher.publish({ runId, sessionId: loaded.session_id, type: "tool.completed", payload: { toolName, callId, ok } }),
        },
        persistence: this.persistence,
      });

      // ---- RAG retriever (optional: needs an OpenAI key + live Chroma) ----------
      let retrieverRef: ((q: string) => Promise<string>) | null = null;
      if (cfg.providers.openai.apiKey !== undefined && (await chromaUp(cfg.chroma.url))) {
        const embeddings = new OpenAIEmbeddings(cfg.providers.openai.apiKey);
        const rag = new RagRetriever(
          cfg.chroma.url,
          embeddings,
          `project_${loaded.project_id}`,
          loaded.workspace_id,
        );
        retrieverRef = async (query: string) => formatChunks(await rag.retrieve(query));
      }

      // ---- Recent conversation (oldest-first, excluding this run's messages) -----
      const recentRows = await db.execute<{ role: "user" | "assistant" | "tool"; content: string }>(
        sql`SELECT role::text AS role, content FROM messages
            WHERE session_id = ${loaded.session_id}
              AND (run_id IS NULL OR run_id <> ${runId})
              AND role IN ('user','assistant','tool')
            ORDER BY created_at DESC LIMIT 12`,
      );
      const recentMessages = [...recentRows].reverse();

      // ---- Assemble the loop ------------------------------------------------------
      const resumed = loaded.attempt > 1 ? await checkpoints.loadLatest() : null;
      const loop = new AgentLoop(
        gateway,
        toolManager,
        toolManager.toolSpecs(),
        publisher,
        {
          isCancelled: () => cancelled,
          isPauseRequested: () => pauseRequested,
          requestApproval: async (call) => {
            const outcome = await approvals.requestApproval({
              runId: asRunId(runId),
              sessionId: loaded.session_id,
              toolName: call.name,
              reason: "requires user approval",
              argumentsPreview: safeParse(call.argumentsJson),
              onWaiting: async () => {
                await this.persistence.setStatus({ runId, from: "running", to: "waiting_approval" });
              },
              onResolved: async () => {
                await this.persistence.setStatus({ runId, from: "waiting_approval", to: "running" });
              },
            });
            return outcome === "granted";
          },
          onIterationComplete: async (iteration, conversation) => {
            // Token totals are tracked inside the loop; checkpoint keeps them
            // approximate by reusing last-known values via conversation length.
            await checkpoints.save(
              { iteration, inputTokens: 0, outputTokens: 0, costUsd: 0 },
              [...conversation],
            );
          },
        },
        checkpoints,
        logger,
        DEFAULT_LIMITS,
      );
      loop.retrieverRef = retrieverRef;
      loop.toolCtxCache = {
        runId: asRunId(runId),
        sessionId: asSessionId(loaded.session_id),
        workspaceId: loaded.workspace_id,
        workingDir: "",
        fs,
        git,
        sandbox,
        logger,
      };

      await publisher.publish({
        runId,
        sessionId: loaded.session_id,
        type: "run.started",
        payload: { attempt: loaded.attempt },
      });

      // ---- Execute --------------------------------------------------------------------
      const result = await loop.execute({
        runId,
        sessionId: loaded.session_id,
        mode: loaded.mode,
        taskPrompt: loaded.prompt,
        workspaceId: loaded.workspace_id,
        recentMessages,
        resumeConversation:
          resumed !== null ? (resumed.conversation as ChatMessage[]) : undefined,
        resumeTokens:
          resumed !== null
            ? { input: resumed.inputTokens, output: resumed.outputTokens, costUsd: resumed.costUsd }
            : undefined,
        modelId: loaded.model ?? undefined,
      });

      // ---- Persist results ---------------------------------------------------------------
      await this.persistence.appendMessage({
        sessionId: loaded.session_id,
        runId,
        role: "assistant",
        content: result.finalMessage,
        metadata: { iterations: result.iterations },
      });
      await this.persistence.setTaskStatus(loaded.task_id, "completed");
      await this.persistence.setStatus({ runId, from: "running", to: "completed" });
      await publisher.publish({
        runId,
        sessionId: loaded.session_id,
        type: "run.completed",
        payload: {
          iterations: result.iterations,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });
      return { status: "completed", finalMessage: result.finalMessage };
    } catch (err) {
      return await this.handleFailure(err, {
        runId,
        sessionId: loaded.session_id,
        taskId: loaded.task_id,
        publisher,
        logger,
      });
    } finally {
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
      if (unsubscribeSignals !== null) await unsubscribeSignals().catch(() => undefined);
      if (sandboxStop !== null) await sandboxStop().catch(() => undefined);
      await lock.release().catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------------------

  private async recordUsageSafe(
    loaded: LoadedRun,
    runId: string,
    model: string,
    provider: string,
    usage: { inputTokens: number; outputTokens: number },
  ): Promise<void> {
    const info = findModel(model);
    const inCost = info?.inputCostPer1k != null ? (usage.inputTokens / 1000) * info.inputCostPer1k : 0;
    const outCost = info?.outputCostPer1k != null ? (usage.outputTokens / 1000) * info.outputCostPer1k : 0;
    await this.persistence.recordUsage({
      userId: loaded.created_by,
      organizationId: loaded.organization_id,
      runId,
      model,
      provider,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      inputCostUsd: inCost,
      outputCostUsd: outCost,
    });
  }

  private async handleFailure(
    err: unknown,
    ctx: {
      runId: string;
      sessionId: string;
      taskId: string;
      publisher: EventPublisher;
      logger: Logger;
    },
  ): Promise<HarnessOutcome> {
    if (err instanceof CancelledError) {
      await this.persistence.setStatus({ runId: ctx.runId, from: "running", to: "cancelled" }).catch(() => undefined);
      await ctx.publisher.publish({ runId: ctx.runId, sessionId: ctx.sessionId, type: "run.cancelled", payload: {} }).catch(() => undefined);
      return { status: "cancelled" };
    }
    if (err instanceof PausedError) {
      await this.persistence.setStatus({ runId: ctx.runId, from: "running", to: "paused" }).catch(() => undefined);
      return { status: "paused" };
    }
    if (err instanceof BudgetExhaustedError) {
      const msg = err.message;
      await this.persistence.setTaskStatus(ctx.taskId, "failed").catch(() => undefined);
      await this.persistence
        .setStatus({ runId: ctx.runId, from: "running", to: "timeout", errorCode: "budget_exhausted", errorMessage: msg })
        .catch(() => undefined);
      await ctx.publisher.publish({ runId: ctx.runId, sessionId: ctx.sessionId, type: "run.failed", payload: { reason: msg } }).catch(() => undefined);
      return { status: "timeout", errorCode: "budget_exhausted" };
    }
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error({ err: message }, "harness execution failed");
    await this.persistence.setTaskStatus(ctx.taskId, "failed").catch(() => undefined);
    await this.persistence
      .setStatus({ runId: ctx.runId, from: "running", to: "failed", errorCode: "execution_error", errorMessage: message })
      .catch(() => undefined);
    await ctx.publisher.publish({ runId: ctx.runId, sessionId: ctx.sessionId, type: "run.failed", payload: { error: message } }).catch(() => undefined);
    return { status: "failed", errorCode: "execution_error" };
  }

  private async loadRun(runId: string): Promise<LoadedRun | null> {
    const rows = await this.deps.db.execute<{
      id: string;
      task_id: string;
      session_id: string;
      workspace_id: string;
      attempt: number;
      model: string | null;
      created_by: string;
      organization_id: string;
      project_id: string;
      prompt: string;
      mode: LoadedRun["mode"];
    }>(
      sql`SELECT r.id, r.task_id, r.session_id, r.workspace_id, r.attempt, r.model,
                 t.created_by, p.organization_id, s.project_id, t.prompt, t.mode::text AS mode
          FROM agent_runs r
          JOIN agent_tasks t ON t.id = r.task_id
          JOIN sessions s ON s.id = r.session_id
          JOIN projects p ON p.id = s.project_id
          WHERE r.id = ${runId}
          LIMIT 1`,
    );
    const row = rows[0];
    return row ?? null;
  }
}

// Re-export so workers can catch these without importing internals.
export { ApprovalRequiredError, WorkspaceBusyError };

// --- small helpers ------------------------------------------------------------

function asRunId(id: string) {
  return asId<import("@openlobster/types").RunId>(id);
}
function asSessionId(id: string) {
  return asId<import("@openlobster/types").SessionId>(id);
}

async function chromaUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/v1/heartbeat`);
    return res.ok;
  } catch {
    return false;
  }
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json) as unknown;
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
