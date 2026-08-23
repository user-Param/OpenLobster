/**
 * Run control signals: cancel / pause / resume / approval decisions.
 * Per CLAUDE.md §24–25 and the approval flow.
 *
 * Transport = Redis pub/sub on channel `run:signal:{runId}`. The durable
 * intent lives in Postgres (run status); these signals just wake the
 * worker's in-flight loop promptly instead of it polling the DB.
 */

import type Redis from "ioredis";
import { getSubscriberRedis, type RedisClient } from "./client";

export const RUN_SIGNAL_PREFIX = "run:signal:";

export type RunSignalType =
  | "cancel"
  | "pause"
  | "resume"
  | "approval.granted"
  | "approval.denied";

export interface RunSignal {
  readonly type: RunSignalType;
  readonly runId: string;
}

function channel(runId: string): string {
  return `${RUN_SIGNAL_PREFIX}${runId}`;
}

export async function publishRunSignal(
  redis: Redis,
  signal: RunSignal,
): Promise<void> {
  await redis.publish(channel(signal.runId), JSON.stringify(signal));
}

/**
 * Subscribe to signals for a single run. Returns an unsubscribe function.
 * The handler is invoked for every well-formed signal on the run's channel.
 */
export async function subscribeRunSignals(
  opts: { url: string },
  runId: string,
  handler: (signal: RunSignal) => void,
): Promise<() => Promise<void>> {
  const sub: RedisClient = getSubscriberRedis(opts);
  const ch = channel(runId);
  await sub.subscribe(ch);

  const listener = (chan: string, message: string): void => {
    if (chan !== ch) return;
    try {
      const parsed = JSON.parse(message) as RunSignal;
      if (typeof parsed.type === "string" && typeof parsed.runId === "string") {
        handler(parsed);
      }
    } catch {
      // Malformed payloads are ignored — never crash the worker loop.
    }
  };
  sub.on("message", listener);

  return async () => {
    sub.off("message", listener);
    try {
      await sub.unsubscribe(ch);
    } catch {
      // Connection may already be gone during shutdown; ignore.
    }
  };
}
