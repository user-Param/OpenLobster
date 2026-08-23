/**
 * Session + membership + message cluster. Per CLAUDE.md §37–39.
 *
 * Note on messages:
 *   - `run_id` is nullable because some messages (e.g. system context) don't
 *     originate from an agent run.
 *   - `metadata` is JSONB to allow per-mode metadata without schema churn.
 */

import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import {
  MESSAGE_ROLES,
  SESSION_MEMBER_ROLES,
  SESSION_STATUSES,
  SESSION_VISIBILITIES,
} from "@openlobster/types";
import { createdAtColumn, deletedAtColumn, primaryUuid, updatedAtColumn } from "./_columns";
import { users } from "./identity";
import { projects, workspaces } from "./projects";

export const sessions = pgTable("sessions", {
  id: primaryUuid(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "restrict" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  visibility: text("visibility", { enum: SESSION_VISIBILITIES }).notNull().default("private"),
  status: text("status", { enum: SESSION_STATUSES }).notNull().default("active"),
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  deletedAt: deletedAtColumn,
});

export const sessionMembers = pgTable(
  "session_members",
  {
    id: primaryUuid(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: SESSION_MEMBER_ROLES }).notNull(),
    createdAt: createdAtColumn,
  },
  (t) => ({
    sessionUserUnique: uniqueIndexOn(t.sessionId, t.userId),
  }),
);

import { uniqueIndex } from "drizzle-orm/pg-core";
function uniqueIndexOn(c1: import("drizzle-orm/pg-core").AnyPgColumn, c2: import("drizzle-orm/pg-core").AnyPgColumn) {
  return uniqueIndex("session_members_session_user_unique").on(c1, c2);
}

export const messages = pgTable("messages", {
  id: primaryUuid(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  // Nullable per CLAUDE.md §39.
  runId: uuid("run_id"),
  role: text("role", { enum: MESSAGE_ROLES }).notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAtColumn,
});
