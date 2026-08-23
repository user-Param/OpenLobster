/**
 * SSE tail support. Two sources combined:
 *   - DB replay: events after Last-Event-ID (durable, ordered).
 *   - Redis live tail: XREAD from the per-run stream.
 *
 * The caller (apps/api SSE route) drives pagination: it replays history,
 * remembers the last sequence sent, then subscribes live and skips anything
 * with sequence <= lastSent (dedupe for the replay/live overlap window).
 */

import { and, asc, eq, gt } from "drizzle-orm";
import type { Db } from "@openlobster/db";
import { events as eventsTable } from "@openlobster/db/schema";
import type { RedisClient } from "@openlobster/redis";
import { runEventStream } from "./envelope";
import type { AgentEventEnvelope } from "./envelope";

export async function loadEventsAfter(
  db: Db,
  runId: string,
  afterSequence: number,
  limit = 500,
): Promise<AgentEventEnvelope[]> {
  const rows = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.runId, runId), gt(eventsTable.sequence, afterSequence)))
    .orderBy(asc(eventsTable.sequence))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    runId: r.runId,
    sessionId: r.sessionId,
    type: r.type as AgentEventEnvelope["type"],
    sequence: Number(r.sequence),
    payload: r.payload,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Read all currently-buffered entries from the run's live stream without
 * blocking. Used to bridge the gap between "replay done" and "subscribe".
 */
export async function readLiveBuffered(
  redis: RedisClient,
  runId: string,
): Promise<AgentEventEnvelope[]> {
  const stream = runEventStream(runId);
  // XRANGE over the whole (capped) stream; entries carry a `json` field.
  const res = await redis.xrange(stream, "-", "+");
  return parseStreamEntries(res);
}

export async function subscribeLive(
  redis: RedisClient,
  runId: string,
  onEvent: (envelope: AgentEventEnvelope) => void,
  signal: AbortSignal,
): Promise<void> {
  const stream = runEventStream(runId);
  let lastId = "$";
  while (!signal.aborted) {
    try {
      // BLOCK in short slices so shutdown stays responsive.
      const res = await redis.xread("BLOCK", 2000, "STREAMS", stream, lastId);
      if (res !== null) {
        const first = res[0];
        const entries = first?.[1] ?? [];
        for (const entry of entries) {
          if (!entry) continue;
          const [id, fields] = entry;
          lastId = id;
          const envs = parseStreamEntries([entry]);
          for (const env of envs) onEvent(env);
        }
      }
    } catch {
      // Transient redis hiccup — brief backoff and keep tailing.
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

type XRangeEntry = [string, string[]];

function parseStreamEntries(entries: readonly XRangeEntry[]): AgentEventEnvelope[] {
  const out: AgentEventEnvelope[] = [];
  for (const [, fields] of entries) {
    for (let i = 0; i + 1 < fields.length; i += 2) {
      if (fields[i] === "json") {
        try {
          out.push(JSON.parse(fields[i + 1] ?? "{}") as AgentEventEnvelope);
        } catch {
          // skip malformed
        }
      }
    }
  }
  return out;
}
