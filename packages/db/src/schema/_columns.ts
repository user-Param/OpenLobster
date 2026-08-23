/**
 * Shared column helpers. Centralized so timestamp semantics, soft-delete
 * columns, and UUID generation stay consistent across all 18 tables.
 *
 * Conventions:
 *   - All primary keys are UUIDv4 generated client-side (gen_random_uuid()
 *     is the PostgreSQL default for uuid columns).
 *   - createdAt is set on insert; updatedAt is touched on every update.
 *   - deletedAt is nullable; presence means soft-deleted.
 */

import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

export const createdAtColumn = timestamp("created_at", { withTimezone: true, mode: "date" })
  .notNull()
  .defaultNow();

export const updatedAtColumn = timestamp("updated_at", { withTimezone: true, mode: "date" })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

export const deletedAtColumn = timestamp("deleted_at", { withTimezone: true, mode: "date" });

export const primaryUuid = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
