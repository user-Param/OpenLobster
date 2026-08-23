/**
 * Authorization helpers. MVP rules (CLAUDE.md §7/§9):
 *   - project access: org membership (any role) OR created the project
 *   - workspace access: follows project access
 *   - session access: project access OR explicit session_member row
 */

import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@openlobster/db";
import {
  organizationMembers,
  projects,
  sessionMembers,
  sessions,
  workspaces,
} from "@openlobster/db/schema";
import { forbidden, notFound } from "../lib/http";

export async function assertProjectAccess(db: Db, userId: string, projectId: string): Promise<void> {
  const rows = await db
    .select({ organizationId: projects.organizationId, createdBy: projects.createdBy })
    .from(projects)
    .where(and(eq(projects.id, projectId), sql`${projects.deletedAt} IS NULL`))
    .limit(1);
  const project = rows[0];
  if (project === undefined) throw notFound("Project");

  if (project.createdBy === userId) return;
  const member = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, project.organizationId),
        eq(organizationMembers.userId, userId),
      ),
    )
    .limit(1);
  if (member.length === 0) throw forbidden("No access to this project");
}

export async function assertWorkspaceAccess(
  db: Db,
  userId: string,
  workspaceId: string,
): Promise<{ projectId: string }> {
  const rows = await db
    .select({ projectId: workspaces.projectId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const ws = rows[0];
  if (ws === undefined) throw notFound("Workspace");
  await assertProjectAccess(db, userId, ws.projectId);
  return { projectId: ws.projectId };
}

export async function assertSessionAccess(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<{ projectId: string; workspaceId: string }> {
  const rows = await db
    .select({ projectId: sessions.projectId, workspaceId: sessions.workspaceId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const session = rows[0];
  if (session === undefined) throw notFound("Session");

  // Direct session membership grants access even without project access.
  const member = await db
    .select({ id: sessionMembers.id })
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, userId)))
    .limit(1);
  if (member.length > 0) return session;

  await assertProjectAccess(db, userId, session.projectId);
  return session;
}
