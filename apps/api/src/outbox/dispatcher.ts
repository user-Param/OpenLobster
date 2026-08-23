/**
 * Transactional outbox dispatcher. Per CLAUDE.md §18.
 *
 * Polls `outbox_events` for unpublished rows (FOR UPDATE SKIP LOCKED so
 * multiple API replicas don't double-deliver) and XADDs them to the Redis
 * run stream, marking publishedAt. Postgres stays the source of truth; Redis
 * is only the delivery mechanism.
 */

import { sql } from "drizzle-orm";
import type { Db } from "@openlobster/db";
import type { RedisClient } from "@openlobster/redis";
import { enqueueRun } from "@openlobster/redis";
import type { Logger } from "pino";

const POLL_MS = 1_000;
const BATCH = 50;

interface OutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  [key: string]: unknown;
}

export class OutboxDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: Db,
    private readonly redis: RedisClient,
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      this.tick()
        .catch((err) => this.logger.warn({ err: (err as Error).message }, "outbox tick failed"))
        .finally(() => {
          this.running = false;
        });
    }, POLL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    const claimed = await this.db.execute<OutboxRow>(
      sql`SELECT id, aggregate_type, aggregate_id, payload
          FROM outbox_events
          WHERE published_at IS NULL
          ORDER BY created_at
          LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED`,
    );
    const rows = [...claimed];
    for (const row of rows) {
      try {
        // Currently only runs flow through the outbox; future aggregates can
        // extend the switch below.
        if (row.aggregate_type === "run") {
          await enqueueRun(this.redis, {
            runId: String(row.payload["runId"] ?? row.aggregate_id),
            attempt: String(row.payload["attempt"] ?? "1"),
          });
        }
        await this.db.execute(
          sql`UPDATE outbox_events SET published_at = now() WHERE id = ${row.id}`,
        );
      } catch (err) {
        this.logger.error(
          { err: (err as Error).message, outboxId: row.id },
          "outbox delivery failed; will retry",
        );
      }
    }
  }
}
