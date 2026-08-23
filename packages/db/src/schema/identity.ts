/**
 * Identity cluster: users, organizations, organization_members.
 * Per CLAUDE.md §32–34.
 */

import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  ORGANIZATION_ROLES,
} from "@openlobster/types";
import { createdAtColumn, deletedAtColumn, primaryUuid, updatedAtColumn } from "./_columns";

export const users = pgTable(
  "users",
  {
    id: primaryUuid(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: deletedAtColumn,
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_unique").on(t.email),
  }),
);

export const organizations = pgTable(
  "organizations",
  {
    id: primaryUuid(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => ({
    slugUnique: uniqueIndex("organizations_slug_unique").on(t.slug),
  }),
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: primaryUuid(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Cast text -> enum union type at the boundary; the database stores as text.
    role: text("role", { enum: ORGANIZATION_ROLES }).notNull(),
    createdAt: createdAtColumn,
  },
  (t) => ({
    orgUserUnique: uniqueIndex("organization_members_org_user_unique").on(t.organizationId, t.userId),
  }),
);
