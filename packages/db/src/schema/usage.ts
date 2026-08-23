/**
 * Usage + permissions + audit cluster. Per CLAUDE.md §46–48.
 *
 * usage_records is treated as an append-only ledger (no updatedAt column)
 * because billing requires immutable evidence.
 *
 * audit_logs are also append-only.
 */

import {
  bigint,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { PERMISSION_GRANTS } from "@openlobster/types";
import { createdAtColumn, primaryUuid } from "./_columns";
import { organizations, users } from "./identity";
import { agentRuns } from "./agent";

export const usageRecords = pgTable(
  "usage_records",
  {
    id: primaryUuid(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull(),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull(),
    totalTokens: bigint("total_tokens", { mode: "number" }).notNull(),
    // Using numeric for currency-safe storage; cast to number at the API edge
    // only for display.
    inputCost: numeric("input_cost", { precision: 18, scale: 8 }).notNull(),
    outputCost: numeric("output_cost", { precision: 18, scale: 8 }).notNull(),
    totalCost: numeric("total_cost", { precision: 18, scale: 8 }).notNull(),
    createdAt: createdAtColumn,
  },
  (t) => ({
    userCreatedIdx: index("usage_records_user_created_idx").on(t.userId, t.createdAt),
    orgCreatedIdx: index("usage_records_org_created_idx").on(t.organizationId, t.createdAt),
    runIdx: index("usage_records_run_idx").on(t.runId),
  }),
);

export const permissions = pgTable(
  "permissions",
  {
    id: primaryUuid(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    permission: text("permission", { enum: PERMISSION_GRANTS }).notNull(),
    createdAt: createdAtColumn,
  },
  (t) => ({
    userResourceIdx: index("permissions_user_resource_idx").on(
      t.userId,
      t.resourceType,
      t.resourceId,
    ),
  }),
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: primaryUuid(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text("ip_address"),
    createdAt: createdAtColumn,
  },
  (t) => ({
    userCreatedIdx: index("audit_logs_user_created_idx").on(t.userId, t.createdAt),
    actionIdx: index("audit_logs_action_idx").on(t.action, t.createdAt),
  }),
);
