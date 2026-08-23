/**
 * Tool-call cluster: tool_calls, tool_results, file_changes.
 * Per CLAUDE.md §43–45.
 *
 * tool_results lives in its own row rather than a column on tool_calls so we
 * can stream very large outputs into object storage (Phase 2) without
 * bloating the call row. The row still has stdout/stderr for small outputs.
 */

import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { FILE_CHANGE_OPERATIONS, TOOL_CALL_STATUSES } from "@openlobster/types";
import { createdAtColumn, primaryUuid } from "./_columns";
import { agentRuns } from "./agent";
import { sessions } from "./sessions";
import { workspaces } from "./projects";

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: primaryUuid(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    arguments: jsonb("arguments").$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: TOOL_CALL_STATUSES }).notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    error: text("error"),
    createdAt: createdAtColumn,
  },
  (t) => ({
    runIdx: index("tool_calls_run_idx").on(t.runId, t.createdAt),
  }),
);

export const toolResults = pgTable("tool_results", {
  id: primaryUuid(),
  toolCallId: uuid("tool_call_id")
    .notNull()
    .references(() => toolCalls.id, { onDelete: "cascade" })
    .unique(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  exitCode: integer("exit_code"),
  stdout: text("stdout"),
  stderr: text("stderr"),
  createdAt: createdAtColumn,
});

export const fileChanges = pgTable(
  "file_changes",
  {
    id: primaryUuid(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    path: text("path").notNull(),
    operation: text("operation", { enum: FILE_CHANGE_OPERATIONS }).notNull(),
    beforeHash: text("before_hash"),
    afterHash: text("after_hash"),
    additions: integer("additions"),
    deletions: integer("deletions"),
    diff: text("diff"),
    createdAt: createdAtColumn,
  },
  (t) => ({
    runIdx: index("file_changes_run_idx").on(t.runId),
    pathIdx: index("file_changes_workspace_path_idx").on(t.workspaceId, t.path),
  }),
);
