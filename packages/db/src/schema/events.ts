/**
 * Persistent agent events. Per CLAUDE.md §49.
 *
 * `sequence` is a per-run monotonic counter so SSE clients can detect gaps
 * (CLAUDE.md §18 event ordering).
 *
 * Note: we do NOT enforce event.type here as a CHECK constraint against the
 * AGENT_EVENT_TYPES enum because new event types will be added over time and
 * we'd rather not require a migration for every new tool we add. Validation
 * happens at the worker boundary (using packages/validation).
 */

import { bigint, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAtColumn, primaryUuid } from "./_columns";
import { agentRuns } from "./agent";
import { sessions } from "./sessions";

export const events = pgTable(
  "events",
  {
    id: primaryUuid(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    // bigint-mode number is fine for our scale; sequence is per-run, not global.
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAtColumn,
  },
  (t) => ({
    runSequenceIdx: index("events_run_sequence_idx").on(t.runId, t.sequence),
  }),
);
