/**
 * Message service — THE critical path. Per CLAUDE.md §10–13:
 *
 *   HTTP → Auth (middleware) → Authorize → Rate limit (middleware) →
 *   BEGIN TRANSACTION { create message, create task, create run, create outbox row } COMMIT →
 *   return 202 { runId, taskId, status }
 *
 * The API never executes the agent; it enqueues and returns.
 * Idempotency: when Idempotency-Key is supplied, replays return the stored
 * response instead of creating duplicate runs (§5).
 */

import type { Db } from "@openlobster/db";
import { agentRuns, agentTasks, idempotencyKeys, messages, outboxEvents, sessions } from "@openlobster/db/schema";
import { eq, sql } from "drizzle-orm";
import { badRequest, forbidden, notFound } from "../lib/http";
import { assertSessionAccess } from "./access";

export interface CreateMessageResult {
  readonly runId: string;
  readonly taskId: string;
  readonly messageId: string;
  readonly status: "queued";
}

const IDEMPOTENCY_TTL_DAYS = 3;

export async function createMessageAndRun(
  db: Db,
  params: {
    userId: string;
    sessionId: string;
    content: string;
    mode: "planning" | "coding" | "reviewing" | "testing";
    model?: string | undefined;
    idempotencyKey?: string | undefined;
  },
): Promise<CreateMessageResult> {
  const { userId, sessionId } = params;

  // --- Authorization ------------------------------------------------------
  const access = await assertSessionAccess(db, userId, sessionId);
  const sessionRow = (
    await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  )[0];
  if (sessionRow === undefined) throw notFound("Session");
  if (sessionRow.status !== "active") throw forbidden("Session is archived");
  void access;

  // --- Idempotency replay check ---------------------------------------------
  if (params.idempotencyKey !== undefined) {
    const prior = (
      await db.execute<{ responseBody: unknown }>(
        sql`SELECT response_body AS "responseBody" FROM idempotency_keys
            WHERE user_id = ${userId} AND key = ${params.idempotencyKey}
              AND endpoint = 'POST /v1/sessions/:sessionId/messages'
              AND expires_at > now()
            LIMIT 1`,
      )
    )[0] as { responseBody?: CreateMessageResult } | undefined;
    if (prior?.responseBody !== undefined && prior.responseBody !== null) {
      const stored = prior.responseBody as CreateMessageResult;
      // Verify the original run still exists (defensive).
      const stillThere = await db.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.id, stored.runId)).limit(1);
      if (stillThere.length > 0) return stored;
    }
  }

  const workspaceId = sessionRow.workspaceId;

  // --- Single transaction: message + task + run + outbox ---------------------
  const result = await db.transaction(async (tx): Promise<CreateMessageResult> => {
    const message = (
      await tx
        .insert(messages)
        .values({ sessionId, role: "user", content: params.content })
        .returning()
    )[0];
    if (message === undefined) throw new Error("message insert returned no rows");

    const task = (
      await tx
        .insert(agentTasks)
        .values({
          sessionId,
          workspaceId,
          createdBy: userId,
          prompt: params.content,
          mode: params.mode,
        })
        .returning()
    )[0];
    if (task === undefined) throw new Error("task insert returned no rows");

    const run = (
      await tx
        .insert(agentRuns)
        .values({
          taskId: task.id,
          sessionId,
          workspaceId,
          status: "queued",
          model: params.model ?? null,
        })
        .returning()
    )[0];
    if (run === undefined) throw new Error("run insert returned no rows");

    // Transactional outbox row — the dispatcher turns this into a Redis XADD.
    await tx.insert(outboxEvents).values({
      aggregateType: "run",
      aggregateId: run.id,
      payload: { runId: run.id, taskId: task.id, attempt: String(run.attempt) },
    });

    if (params.idempotencyKey !== undefined) {
      await tx.insert(idempotencyKeys).values({
        userId,
        key: params.idempotencyKey,
        endpoint: "POST /v1/sessions/:sessionId/messages",
        responseBody: {
          runId: run.id,
          taskId: task.id,
          messageId: message.id,
          status: "queued",
        },
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_DAYS * 24 * 60 * 60 * 1000),
      }).onConflictDoNothing();
    }

    return { runId: run.id, taskId: task.id, messageId: message.id, status: "queued" };
  });

  return result;
}

export function assertContentOk(content: string): void {
  if (content.trim().length === 0) throw badRequest("Message content cannot be empty");
}
