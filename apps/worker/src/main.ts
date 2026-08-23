/**
 * Agent Worker — execution plane entrypoint. Per CLAUDE.md §15:
 *
 *   Queue → receive runId → load run → acquire lease → create harness →
 *   execute → heartbeat → persist state → ACK
 *
 * Concurrency: one in-flight run per worker process (MVP). The DB lease +
 * advisory workspace lock make horizontal scaling safe anyway.
 *
 * Retry policy: transient harness failures requeue the run with attempt+1
 * (max 3 attempts, exponential backoff). Poisoned runs are marked failed.
 */

import { randomUUID } from "node:crypto";
import { getConfig, redactedSummary } from "@openlobster/config";
import { closeDb, createDb } from "@openlobster/db";
import {
  ackRun,
  consumeRun,
  closeRedis,
  createRedis,
  enqueueRun,
  ensureConsumerGroup,
  reclaimStaleRuns,
  type ConsumedRun,
} from "@openlobster/redis";
import { getLogger, withContext } from "@openlobster/logger";
import { AgentHarness } from "@openlobster/harness";

const BLOCK_MS = 5_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [5_000, 30_000];
const STALE_RECLAIM_MS = 120_000;
const STALE_RECLAIM_EVERY_MS = 60_000;

const logger = getLogger("worker");

// Flipped by signal handlers; the consume loop checks it every BLOCK_MS.
let shuttingDown = false;
process.on("SIGTERM", () => {
  logger.info("SIGTERM received; stopping consumer loop");
  shuttingDown = true;
});

async function main(): Promise<void> {
  const cfg = getConfig();
  const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  logger.info(`starting ${workerId} (${redactedSummary(cfg)})`);

  const db = createDb({ url: cfg.database.url });
  const redis = createRedis({ url: cfg.redis.url });
  await ensureConsumerGroup(redis);

  const harness = new AgentHarness({ cfg, db, redis, workerId });
  let processing: Promise<void> | null = null;

  // Periodically claim runs abandoned by dead workers.
  const reclaimTimer = setInterval(() => {
    if (shuttingDown) return;
    void reclaimStaleRuns(redis, workerId, STALE_RECLAIM_MS)
      .then((runs) => {
        for (const r of runs) {
          logger.info({ runId: r.msg.runId }, "reclaimed stale run");
          processRun(r).catch((err) =>
            logger.error({ err: (err as Error).message }, "reclaimed run failed"),
          );
        }
      })
      .catch(() => undefined);
  }, STALE_RECLAIM_EVERY_MS);
  reclaimTimer.unref();

  async function processRun(consumed: ConsumedRun): Promise<void> {
    const { runId } = consumed.msg;
    const attempt = Number(consumed.msg.attempt);
    const log = withContext(logger, { runId, workerId });

    try {
      const outcome = await harness.run(runId, log);
      log.info({ status: outcome.status }, "run finished");

      if (outcome.status === "requeued" && !shuttingDown) {
        // Lease was busy or workspace locked — retry later without burning an
        // attempt (attempt stays the same).
        setTimeout(
          () => {
            void enqueueRun(redis, { runId, attempt: String(attempt) }).catch((err: Error) =>
              log.error({ err: err.message }, "re-enqueue failed"),
            );
          },
          10_000,
        ).unref();
      }
      if (
        outcome.status === "failed" &&
        outcome.errorCode === "execution_error" &&
        attempt < MAX_ATTEMPTS &&
        !shuttingDown
      ) {
        const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
        log.warn({ nextAttempt: attempt + 1, delayMs: delay }, "scheduling retry");
        setTimeout(
          () => {
            void enqueueRun(redis, { runId, attempt: String(attempt + 1) }).catch((err: Error) =>
              log.error({ err: err.message }, "retry enqueue failed"),
            );
          },
          delay,
        ).unref();
      }
    } catch (err) {
      log.error({ err: (err as Error).stack }, "harness threw unexpectedly");
    } finally {
      await ackRun(redis, consumed.id).catch(() => undefined);
    }
  }

  // --- main loop -------------------------------------------------------------
  while (!shuttingDown) {
    try {
      const consumed = await consumeRun(redis, workerId, BLOCK_MS);
      if (consumed === null) continue;
      if (shuttingDown) {
        // Leave the message pending (un-ACKed): another worker's
        // reclaimStaleRuns will pick it up after the idle window.
        continue;
      }
      processing = processRun(consumed);
      await processing;
      processing = null;
    } catch (err) {
      logger.error({ err: (err as Error).message }, "consume loop error");
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }

  // --- shutdown -----------------------------------------------------------------
  if (processing !== null) {
    logger.info("waiting for in-flight run to reach a safe boundary");
    await Promise.race([processing, new Promise((r) => setTimeout(r, 30_000))]);
  }
  clearInterval(reclaimTimer);
  await closeRedis();
  await closeDb();
  logger.info("worker stopped");
}

process.on("SIGINT", () => {
  shuttingDown = true;
  process.exit(0);
});

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.stack : String(err) }, "worker failed to start");
  process.exit(1);
});
