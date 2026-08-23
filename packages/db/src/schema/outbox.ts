/**
 * Transactional outbox. Per CLAUDE.md §18 (Database transactions + queue
 * consistency).
 *
 * The API inserts the run AND its outbox row inside the same Postgres
 * transaction, so "DB says queued" can never diverge from "Redis has it".
 * The OutboxDispatcher (apps/api) polls for unpublished rows and XADDs them
 * to the Redis Stream, marking publishedAt when done.
 *
 * Postgres = source of truth. Redis = delivery mechanism.
 */

import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAtColumn, primaryUuid } from "./_columns";
import { agentRuns } from "./agent";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: primaryUuid(),
    // Currently only "run" is produced; kept as text so future aggregates
    // (e.g. billing events) reuse this table without a migration.
    aggregateType: text("aggregate_type").notNull().default("run"),
    aggregateId: uuid("aggregate_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAtColumn,
  },
  (t) => ({
    unpublishedIdx: index("outbox_events_unpublished_idx").on(t.createdAt),
  }),
);

/** Convenience reference export so FK tooling sees the relationship. */
export const outboxRunRef = agentRuns.id;
