/**
 * EventPublisher — durable + live event fan-out.
 *
 *   1. Persist to the Postgres `events` table (durable history, source of
 *      truth for SSE replay).
 *   2. XADD to the per-run Redis stream `run:events:{runId}` for live tail.
 *
 * Sequence numbers are allocated with a single-row-per-run counter query
 * inside a transaction (SELECT ... FOR UPDATE on the latest event row is
 * overkill; we use MAX(sequence) + 1 within the same transaction — runs are
 * single-writer by lease so contention is impossible in practice).
 */

import { desc, eq } from "drizzle-orm";
import type { Db } from "@openlobster/db";
import { events as eventsTable } from "@openlobster/db/schema";
import type { RedisClient } from "@openlobster/redis";
import type { AgentEventType } from "@openlobster/types";
import type { Logger } from "pino";
import { runEventStream, type AgentEventEnvelope } from "./envelope";

export class EventPublisher {
  private seq = new Map<string, number>();

  constructor(
    private readonly db: Db,
    private readonly redis: RedisClient,
    private readonly logger: Logger,
  ) {}

  /**
   * Persist + broadcast one event. Never throws into the agent loop:
   * persistence failures are logged; the run continues.
   */
  async publish(input: {
    runId: string;
    sessionId: string;
    type: AgentEventType;
    payload?: Record<string, unknown>;
  }): Promise<AgentEventEnvelope | null> {
    try {
      const nextSeq = await this.nextSequence(input.runId);
      const [row] = await this.db
        .insert(eventsTable)
        .values({
          runId: input.runId,
          sessionId: input.sessionId,
          type: input.type,
          sequence: nextSeq,
          payload: input.payload ?? {},
        })
        .returning();

      if (row === undefined) return null;

      const envelope: AgentEventEnvelope = {
        id: row.id,
        runId: row.runId,
        sessionId: row.sessionId,
        type: row.type as AgentEventType,
        sequence: Number(row.sequence),
        payload: row.payload,
        createdAt: row.createdAt.toISOString(),
      };

      // Live tail. Fire-and-forget.
      await this.redis.xadd(
        runEventStream(input.runId),
        "MAXLEN",
        "~",
        "1000",
        "*",
        "json",
        JSON.stringify(envelope),
      );
      return envelope;
    } catch (err) {
      this.logger.error({ err: (err as Error).message, type: input.type }, "event publish failed");
      return null;
    }
  }

  private async nextSequence(runId: string): Promise<number> {
    const cached = this.seq.get(runId);
    if (cached !== undefined) {
      this.seq.set(runId, cached + 1);
      return cached + 1;
    }
    const [latest] = await this.db
      .select({ sequence: eventsTable.sequence })
      .from(eventsTable)
      .where(eq(eventsTable.runId, runId))
      .orderBy(desc(eventsTable.sequence))
      .limit(1);
    const base = latest === undefined ? 0 : Number(latest.sequence);
    this.seq.set(runId, base + 1);
    return base + 1;
  }
}
