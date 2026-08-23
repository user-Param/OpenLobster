/**
 * Project + Workspace cluster. Per CLAUDE.md §35–36.
 */

import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { WORKSPACE_STATUSES, WORKSPACE_TYPES } from "@openlobster/types";
import { createdAtColumn, deletedAtColumn, primaryUuid, updatedAtColumn } from "./_columns";
import { organizations, users } from "./identity";

export const projects = pgTable("projects", {
  id: primaryUuid(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "restrict" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  deletedAt: deletedAtColumn,
});

export const workspaces = pgTable("workspaces", {
  id: primaryUuid(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // "local" | "remote" | "sandbox"
  type: text("type", { enum: WORKSPACE_TYPES }).notNull(),
  // "active" | "inactive" | "provisioning" | "destroyed"
  status: text("status", { enum: WORKSPACE_STATUSES }).notNull().default("provisioning"),
  repositoryUrl: text("repository_url"),
  branch: text("branch"),
  rootPath: text("root_path"),
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
});
