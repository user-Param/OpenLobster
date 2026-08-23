/**
 * Postgres client factory. Returns a singleton drizzle instance.
 *
 * We use the `postgres` driver (not `pg`) because it's faster, supports
 * native ESM, and has better TypeScript types.
 *
 * Why singleton: connection pools are expensive, and we want one per process.
 * The api process and the worker process each have their own pool.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export type Db = PostgresJsDatabase<typeof schema>;

let dbInstance: Db | null = null;
let sqlInstance: ReturnType<typeof postgres> | null = null;

export interface CreateDbOptions {
  readonly url: string;
  /** Max pool connections. Default 10 — tune per process. */
  readonly max?: number;
  /** Idle connection timeout (seconds). */
  readonly idleTimeout?: number;
  /** Disable prepared statements for pgbouncer compatibility. */
  readonly prepare?: boolean;
}

export function createDb(opts: CreateDbOptions): Db {
  const sql = postgres(opts.url, {
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeout ?? 20,
    prepare: opts.prepare ?? true,
    onnotice: () => {
      // Silently swallow Postgres NOTICE messages; surface them via logger instead.
    },
  });
  sqlInstance = sql;
  dbInstance = drizzle(sql, { schema });
  return dbInstance;
}

/**
 * Returns the singleton db, creating it lazily from the provided URL.
 * Throws if called before createDb() — fail fast.
 */
export function getDb(url?: string): Db {
  if (dbInstance === null) {
    if (url === undefined) {
      throw new Error(
        "getDb() called before createDb(); pass a url or initialize at process startup.",
      );
    }
    return createDb({ url });
  }
  return dbInstance;
}

/**
 * Closes the underlying Postgres pool. Call this on graceful shutdown.
 * Safe to call multiple times.
 */
export async function closeDb(): Promise<void> {
  if (sqlInstance !== null) {
    await sqlInstance.end({ timeout: 5 });
    sqlInstance = null;
    dbInstance = null;
  }
}

export { schema };
