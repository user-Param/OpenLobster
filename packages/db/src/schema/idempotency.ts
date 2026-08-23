/**
 * Idempotency keys. Per CLAUDE.md §5 (Idempotency).
 *
 * Clients send `Idempotency-Key` on mutating endpoints (notably
 * POST /v1/sessions/:id/messages). The first request stores the key together
 * with the serialized response; replays within the TTL return the stored
 * response instead of creating duplicate tasks/runs.
 *
 * Keys are scoped per user — the same UUID sent by two different users is
 * two different logical requests.
 */

import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createdAtColumn, primaryUuid } from "./_columns";
import { users } from "./identity";

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    // Composite identity is (userId, key); we still need a surrogate PK for
    // consistency with every other table.
    id: primaryUuid(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    endpoint: text("endpoint").notNull(),
    responseStatus: text("response_status"),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: createdAtColumn,
  },
  (t) => ({
    userKeyUnique: uniqueIndex("idempotency_keys_user_key_unique").on(t.userId, t.key),
    expiryIdx: index("idempotency_keys_expiry_idx").on(t.expiresAt),
  }),
);

// Re-exported type for callers building inserts.
export type AnyPgColumnRef = AnyPgColumn;
