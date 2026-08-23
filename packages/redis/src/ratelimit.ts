/**
 * Fixed-window rate limiter backed by Redis INCR + EXPIRE. Per CLAUDE.md §6C.
 *
 * Not perfect (window boundaries allow 2x burst) but dependency-free and
 * correct enough for MVP abuse protection. Keys are namespaced so API
 * endpoints can have independent budgets.
 */

import type Redis from "ioredis";

export interface RateLimitResult {
  /** Whether the request should be allowed through. */
  readonly allowed: boolean;
  /** Current count inside the window. */
  readonly count: number;
  /** Seconds until the window resets. */
  readonly resetSeconds: number;
}

export async function rateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const k = `rate:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const count = await redis.incr(k);
  if (count === 1) {
    await redis.expire(k, windowSeconds + 1);
  }
  return {
    allowed: count <= limit,
    count,
    resetSeconds: windowSeconds,
  };
}
