/**
 * Redis client factory.
 *
 * We keep TWO connections:
 *   - the main command connection, and
 *   - a duplicated connection for pub/sub (Redis protocol forbids issuing
 *     regular commands on a connection that has entered subscriber mode).
 *
 * Redis is transport/cache ONLY — never the source of truth (CLAUDE.md §31
 * MVP constraints). Losing Redis degrades availability, never correctness.
 */

import Redis from "ioredis";

export type RedisClient = Redis;

let mainClient: Redis | null = null;
let subClient: Redis | null = null;

export interface CreateRedisOptions {
  readonly url: string;
  readonly maxRetriesPerRequest?: number;
}

export function createRedis(opts: CreateRedisOptions): RedisClient {
  if (mainClient !== null) return mainClient;
  mainClient = new Redis(opts.url, {
    maxRetriesPerRequest: opts.maxRetriesPerRequest ?? 3,
    lazyConnect: false,
    // Don't let a missing Redis crash the process at startup; commands will
    // reject and callers decide whether that's fatal for them.
    enableOfflineQueue: true,
  });
  return mainClient;
}

/**
 * Dedicated connection for pub/sub subscriptions (subscribe-mode connections
 * cannot run regular commands).
 */
export function getSubscriberRedis(opts: CreateRedisOptions): RedisClient {
  if (subClient !== null) return subClient;
  const main = createRedis(opts);
  subClient = main.duplicate();
  return subClient;
}

export async function closeRedis(): Promise<void> {
  const jobs: Array<Promise<unknown>> = [];
  if (subClient !== null) {
    jobs.push(subClient.quit().catch(() => undefined));
    subClient = null;
  }
  if (mainClient !== null) {
    jobs.push(mainClient.quit().catch(() => undefined));
    mainClient = null;
  }
  await Promise.all(jobs);
}
