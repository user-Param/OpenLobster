/**
 * Agent run queue on Redis Streams. Per CLAUDE.md §16 (Queue LLD).
 *
 * Stream:  `agent:runs`
 * Group:   `workers` (created lazily, MKSTREAM)
 *
 * Delivery semantics:
 *   - XADD by the API's outbox dispatcher (Postgres is the trigger).
 *   - Workers XREADGROUP with ">" for new messages; each message carries a
 *     runId. The DB lease (agent_runs.lease_owner) — not the stream PEL —
 *     is the real concurrency guard, so at-least-once delivery here is fine.
 *   - XACK after the worker finishes (or decides to skip/requeue).
 */

import type Redis from "ioredis";

export const RUN_STREAM = "agent:runs";
export const RUN_CONSUMER_GROUP = "workers";
/** Fields used inside the stream entry. */
export interface RunQueueMessage {
  readonly runId: string;
  readonly attempt: string;
}

export async function ensureConsumerGroup(redis: Redis): Promise<void> {
  try {
    await redis.xgroup("CREATE", RUN_STREAM, RUN_CONSUMER_GROUP, "$", "MKSTREAM");
  } catch (err) {
    // BUSYGROUP = group already exists, which is fine.
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("BUSYGROUP")) throw err;
  }
}

export async function enqueueRun(
  redis: Redis,
  msg: RunQueueMessage,
): Promise<string> {
  const id = await redis.xadd(RUN_STREAM, "*", "runId", msg.runId, "attempt", msg.attempt);
  if (id === null) throw new Error("XADD returned null id");
  return id;
}

export interface ConsumedRun {
  /** Redis message id — needed for XACK. */
  readonly id: string;
  readonly msg: RunQueueMessage;
}

/**
 * Blocking read of the next run for this consumer. Resolves null on timeout.
 */
export async function consumeRun(
  redis: Redis,
  consumerName: string,
  blockMs: number,
): Promise<ConsumedRun | null> {
  const res = (await redis.xreadgroup(
    "GROUP",
    RUN_CONSUMER_GROUP,
    consumerName,
    "COUNT",
    1,
    "BLOCK",
    blockMs,
    "STREAMS",
    RUN_STREAM,
    ">",
  )) as unknown as Array<[string, Array<[string, string[]]>]> | null;
  if (res === null) return null;
  // res: [ [streamName, [ [msgId, [field, value, ...]], ... ] ] ]
  const firstStream = res[0];
  const entries = firstStream?.[1];
  const entry = entries?.[0];
  if (!entry) return null;
  const [id, fields] = entry;
  const map = toMap(fields);
  if (typeof map["runId"] !== "string") return null;
  return {
    id,
    msg: {
      runId: map["runId"] as string,
      attempt: typeof map["attempt"] === "string" ? (map["attempt"] as string) : "1",
    },
  };
}

export async function ackRun(redis: Redis, messageId: string): Promise<void> {
  await redis.xack(RUN_STREAM, RUN_CONSUMER_GROUP, messageId);
}

/**
 * Claim messages that were delivered to a dead consumer and never acked.
 * Called periodically by workers so crashed runs still get processed
 * (the DB lease expiry is what actually makes them safe to re-run).
 */
export async function reclaimStaleRuns(
  redis: Redis,
  consumerName: string,
  minIdleMs: number,
  count = 10,
): Promise<ConsumedRun[]> {
  // AUTO claim moves pending entries idle > minIdleMs to this consumer.
  const res = (await redis.xautoclaim(
    RUN_STREAM,
    RUN_CONSUMER_GROUP,
    consumerName,
    minIdleMs,
    "0-0",
    "COUNT",
    count,
  )) as unknown as [string, Array<[string, string[]]>, string | null];
  const entries = res[1] ?? [];
  const out: ConsumedRun[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    const [id, fields] = entry;
    const map = toMap(fields);
    if (typeof map["runId"] === "string") {
      out.push({
        id,
        msg: {
          runId: map["runId"] as string,
          attempt: typeof map["attempt"] === "string" ? (map["attempt"] as string) : "1",
        },
      });
    }
  }
  return out;
}

function toMap(fields: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const k = fields[i];
    const v = fields[i + 1];
    if (k !== undefined && v !== undefined) map[k] = v;
  }
  return map;
}
