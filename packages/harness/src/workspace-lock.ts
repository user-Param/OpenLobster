/**
 * Workspace lock. Per CLAUDE.md §6 (Workspace locking):
 *
 *   "For an MVP: One active coding run per workspace."
 *
 * Implementation: a PostgreSQL session-level advisory lock keyed by the
 * workspace UUID, held for the entire run on a DEDICATED pool connection.
 * Advisory locks are automatically released if the worker dies (connection
 * closes), which gives us crash-safe mutual exclusion without extra tables
 * or TTL bookkeeping.
 */

import { sql } from "drizzle-orm";
import type postgres from "postgres";
import { createHash } from "node:crypto";

/** Deterministic 63-bit key from a workspace id (pg advisory keys are bigint). */
function lockKey(workspaceId: string): string {
  const hex = createHash("sha256").update(`openlobster:ws:${workspaceId}`).digest("hex").slice(0, 16);
  // Force positive signed bigint.
  const n = BigInt("0x" + hex) & 0x7fffffffffffffffn;
  return n.toString();
}

export class WorkspaceBusyError extends Error {
  constructor(readonly workspaceId: string) {
    super(`Workspace ${workspaceId} is locked by another run`);
    this.name = "WorkspaceBusyError";
  }
}

/**
 * The raw `postgres.Sql` handle is needed to hold one connection open for
 * the whole run; drizzle's typed API doesn't expose session-scoped state.
 */
export class WorkspaceLock {
  private conn: postgres.Sql | null = null;

  /**
   * Try to acquire without blocking. Throws WorkspaceBusyError when another
   * run currently holds the workspace.
   */
  async acquire(url: string, workspaceId: string): Promise<void> {
    const sql = (await import("postgres")).default;
    this.conn = sql(url, { max: 1, idle_timeout: 0, prepare: false });
    const res = await this.conn`
      SELECT pg_try_advisory_lock(${lockKey(workspaceId)}::bigint) AS acquired
    `;
    if (res[0]?.acquired !== true) {
      await this.conn.end({ timeout: 1 });
      this.conn = null;
      throw new WorkspaceBusyError(workspaceId);
    }
  }

  async release(): Promise<void> {
    if (this.conn === null) return;
    try {
      await this.conn`SELECT pg_advisory_unlock_all()`;
    } finally {
      await this.conn.end({ timeout: 5 }).catch(() => undefined);
      this.conn = null;
    }
  }
}

export function advisoryLockSqlFragment(workspaceId: string) {
  return sql`${lockKey(workspaceId)}::bigint`;
}
