/**
 * Agent execution cluster: agent_tasks, agent_runs, agent_checkpoints.
 * Per CLAUDE.md §40–42.
 *
 * Critical invariants encoded here:
 *   - agent_tasks → agent_runs: one task has many runs (retries).
 *   - agent_runs.attempt: monotonically increasing per task.
 *   - agent_runs.status is constrained to the RunStatus union.
 *   - agent_runs.lease_owner + lease_expires_at implement the worker lease
 *     required by CLAUDE.md §4 (concurrency).
 *   - agent_checkpoints.state/context are JSONB; their schemas are owned by
 *     the Harness package, not here.
 */

import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  AGENT_MODES,
  RUN_STATUSES,
} from "@openlobster/types";
import { createdAtColumn, primaryUuid, updatedAtColumn } from "./_columns";
import { users } from "./identity";
import { sessions } from "./sessions";
import { workspaces } from "./projects";

export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: primaryUuid(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    prompt: text("prompt").notNull(),
    mode: text("mode", { enum: AGENT_MODES }).notNull().default("coding"),
    priority: integer("priority").notNull().default(0),
    status: text("status").notNull().default("pending"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => ({
    sessionIdx: index("agent_tasks_session_created_idx").on(t.sessionId, t.createdAt),
  }),
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: primaryUuid(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => agentTasks.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    workerId: text("worker_id"),
    status: text("status", { enum: RUN_STATUSES }).notNull().default("queued"),
    attempt: integer("attempt").notNull().default(1),
    model: text("model"),
    provider: text("provider"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    // --- Concurrency / lease (CLAUDE.md §4) ---
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => ({
    statusIdx: index("agent_runs_status_idx").on(t.status),
    taskIdx: index("agent_runs_task_idx").on(t.taskId),
    sessionIdx: index("agent_runs_session_idx").on(t.sessionId, t.createdAt),
    leaseIdx: index("agent_runs_lease_idx").on(t.leaseOwner, t.leaseExpiresAt),
    // Guard against impossible state combinations at the DB layer.
    completedAtConsistency: check(
      "agent_runs_completed_at_consistency",
      sql`(${t.status} IN ('completed','failed','cancelled','timeout')) = (${t.completedAt} IS NOT NULL)`,
    ),
  }),
);

export const agentCheckpoints = pgTable(
  "agent_checkpoints",
  {
    id: primaryUuid(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    // State is Harness-defined; we only assert object shape at write time.
    state: jsonb("state").$type<Record<string, unknown>>().notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAtColumn,
  },
  (t) => ({
    runIdx: index("agent_checkpoints_run_idx").on(t.runId, t.sequence),
  }),
);
