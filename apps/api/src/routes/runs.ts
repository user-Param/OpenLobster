/**
 * Run routes. Per CLAUDE.md §23–28:
 *   GET  /v1/runs/:id           run status + usage
 *   POST /v1/runs/:id/cancel    cooperative cancellation via Redis signal
 *   POST /v1/runs/:id/pause     pause (running runs) — checkpoint on next boundary
 *   POST /v1/runs/:id/resume    requeue a paused run
 *   GET  /v1/runs/:id/events    SSE stream with Last-Event-ID replay
 *   GET  /v1/runs/:id/diff      per-file changes produced by the run
 */

import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@openlobster/db";
import { agentRuns, fileChanges, outboxEvents } from "@openlobster/db/schema";
import type { RedisClient } from "@openlobster/redis";
import { enqueueRun, publishRunSignal } from "@openlobster/redis";
import { loadEventsAfter, readLiveBuffered, subscribeLive } from "@openlobster/events";
import type { AgentEventEnvelope } from "@openlobster/events";
import type { RunStatus } from "@openlobster/types";
import { asyncHandler, conflict, notFound } from "../lib/http";
import type { AuthedRequest } from "../middleware/auth";
import { assertSessionAccess } from "../services/access";

async function loadRunForUser(db: Db, userId: string, runId: string) {
  const row = (
    await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, runId))
      .limit(1)
  )[0];
  if (row === undefined) throw notFound("Run");
  await assertSessionAccess(db, userId, row.sessionId);
  return row;
}

export function runRoutes(opts: { db: Db; redis: RedisClient; redisUrl: string }): Router {
  const router = Router();
  const { db, redis, redisUrl } = opts;

  router.get(
    "/runs/:runId",
    asyncHandler(async (req: AuthedRequest, res) => {
      const run = await loadRunForUser(db, req.auth!.userId, req.params["runId"]!);
      const usage = (
        await db.execute<{ input_tokens: string | number; output_tokens: string | number; total_cost: string | number }>(
          sql`SELECT coalesce(sum(input_tokens),0) AS input_tokens,
                     coalesce(sum(output_tokens),0) AS output_tokens,
                     coalesce(sum(total_cost),0) AS total_cost
              FROM usage_records WHERE run_id = ${run.id}`,
        )
      )[0];
      res.json({
        id: run.id,
        taskId: run.taskId,
        status: run.status,
        attempt: run.attempt,
        model: run.model,
        provider: run.provider,
        startedAt: run.startedAt?.toISOString() ?? null,
        completedAt: run.completedAt?.toISOString() ?? null,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
        usage: {
          inputTokens: Number(usage?.input_tokens ?? 0),
          outputTokens: Number(usage?.output_tokens ?? 0),
          estimatedCostUsd: Number(usage?.total_cost ?? 0),
        },
      });
    }),
  );

  const signalAction = (signal: "cancel" | "pause") =>
    asyncHandler(async (req: AuthedRequest, res) => {
      const run = await loadRunForUser(db, req.auth!.userId, req.params["runId"]!);
      const status = run.status as RunStatus;

      // Terminal states cannot be cancelled/paused.
      if (["completed", "failed", "cancelled", "timeout"].includes(status)) {
        throw conflict(`Run already ${status}`);
      }
      if (signal === "pause" && status !== "running" && status !== "waiting_tool") {
        throw conflict(`Cannot pause a ${status} run`);
      }

      await publishRunSignal(redis, { type: signal, runId: run.id });

      // Queued runs have no worker listening yet — transition directly.
      if (status === "queued" && signal === "cancel") {
        await db.update(agentRuns).set({ status: "cancelled", completedAt: sql`now()` }).where(eq(agentRuns.id, run.id));
      }
      res.status(202).json({ status: signal === "cancel" ? "cancelling" : "pausing" });
    });

  router.post("/runs/:runId/cancel", signalAction("cancel"));
  router.post("/runs/:runId/pause", signalAction("pause"));

  router.post(
    "/runs/:runId/resume",
    asyncHandler(async (req: AuthedRequest, res) => {
      const run = await loadRunForUser(db, req.auth!.userId, req.params["runId"]!);
      if (run.status !== "paused") throw conflict(`Cannot resume a ${run.status} run`);

      // Durable re-queue through the outbox, then immediate delivery attempt.
      await db.transaction(async (tx) => {
        await tx.insert(outboxEvents).values({
          aggregateType: "run",
          aggregateId: run.id,
          payload: { runId: run.id, attempt: String(run.attempt), resume: true },
        });
        await tx
          .update(agentRuns)
          .set({ leaseOwner: null, leaseExpiresAt: null })
          .where(eq(agentRuns.id, run.id));
      });
      await enqueueRun(redis, { runId: run.id, attempt: String(run.attempt) });
      res.status(202).json({ status: "resuming" });
    }),
  );

  router.get(
    "/runs/:runId/events",
    asyncHandler(async (req: AuthedRequest, res) => {
      const run = await loadRunForUser(db, req.auth!.userId, req.params["runId"]!);

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.write("retry: 2000\n\n");

      const controller = new AbortController();
      let closed = false;
      req.on("close", () => {
        closed = true;
        controller.abort();
      });

      const lastEventIdHeader = req.headers["last-event-id"] as string | undefined;
      const sinceQuery = req.query["since"];
      let lastSent =
        lastEventIdHeader !== undefined && lastEventIdHeader !== ""
          ? Number(lastEventIdHeader)
          : typeof sinceQuery === "string" && sinceQuery !== ""
            ? Number(sinceQuery)
            : -1;

      const send = (env: AgentEventEnvelope): void => {
        if (closed) return;
        if (env.sequence <= lastSent) return; // dedupe replay/live overlap
        lastSent = env.sequence;
        res.write(`id: ${env.sequence}\nevent: ${env.type}\ndata: ${JSON.stringify(env)}\n\n`);
      };

      try {
        // 1) Durable replay from Postgres.
        for (;;) {
          const batch = await loadEventsAfter(db, run.id, lastSent, 500);
          if (batch.length === 0) break;
          for (const env of batch) send(env);
          if (batch.length < 500) break;
        }

        // 2) Anything buffered live in Redis that DB replay may have missed.
        for (const env of await readLiveBuffered(redis, run.id)) send(env);

        // 3) Follow live until client disconnects or the run terminates.
        await subscribeLive(redis, run.id, send, controller.signal);
      } catch {
        // Client went away; nothing to do.
      }
      if (!closed) res.end();
    }),
  );

  router.get(
    "/runs/:runId/diff",
    asyncHandler(async (req: AuthedRequest, res) => {
      const run = await loadRunForUser(db, req.auth!.userId, req.params["runId"]!);
      // Latest change per path within this run.
      const rows = await db.execute<{
        path: string;
        operation: string;
        additions: number;
        deletions: number;
        diff: string | null;
      }>(
        sql`SELECT DISTINCT ON (path) path, operation::text AS operation, additions, deletions, diff
            FROM file_changes WHERE run_id = ${run.id}
            ORDER BY path, created_at DESC`,
      );
      const files = [...rows].map((r) => ({
        path: r.path,
        operation: r.operation,
        additions: r.additions,
        deletions: r.deletions,
        diff: r.diff ?? "",
      }));
      const totals = files.reduce(
        (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
        { additions: 0, deletions: 0 },
      );
      res.json({ files, totals });
    }),
  );

  return router;
}
