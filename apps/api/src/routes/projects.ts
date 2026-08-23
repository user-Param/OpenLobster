/**
 * Project + workspace routes. Per CLAUDE.md §6–7 and the frozen API surface
 * in §53. Projects soft-delete; workspaces are restricted (referenced by runs).
 */

import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@openlobster/db";
import { organizationMembers, projects, workspaces } from "@openlobster/db/schema";
import {
  createProjectSchema,
  createWorkspaceSchema,
  updateProjectSchema,
  updateWorkspaceSchema,
} from "@openlobster/validation";
import { asyncHandler, notFound, forbidden, pruneUndefined } from "../lib/http";
import type { AuthedRequest } from "../middleware/auth";
import { assertProjectAccess, assertWorkspaceAccess } from "../services/access";

export function projectRoutes(db: Db): Router {
  const router = Router();

  router.post(
    "/",
    asyncHandler(async (req: AuthedRequest, res) => {
      const input = createProjectSchema.parse(req.body);
      const userId = req.auth!.userId;
      const created = (
        await db
          .insert(projects)
          .values({
            organizationId: req.auth!.organizationId,
            name: input.name,
            description: input.description ?? null,
            createdBy: userId,
          })
          .returning()
      )[0];
      res.status(201).json({ id: created!.id, name: created!.name });
    }),
  );

  router.get(
    "/",
    asyncHandler(async (req: AuthedRequest, res) => {
      const rows = await db.execute<{ id: string; name: string; description: string | null; role: string }>(
        sql`SELECT DISTINCT p.id, p.name, p.description, om.role::text AS role
            FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id AND om.user_id = ${req.auth!.userId}
            WHERE p.deleted_at IS NULL
            ORDER BY p.created_at DESC`,
      );
      res.json({ projects: [...rows] });
    }),
  );

  router.get(
    "/:projectId",
    asyncHandler(async (req: AuthedRequest, res) => {
      await assertProjectAccess(db, req.auth!.userId, req.params["projectId"]!);
      const row = (
        await db
          .select()
          .from(projects)
          .where(and(eq(projects.id, req.params["projectId"]!), sql`${projects.deletedAt} IS NULL`))
          .limit(1)
      )[0];
      if (row === undefined) throw notFound("Project");
      res.json(row);
    }),
  );

  router.patch(
    "/:projectId",
    asyncHandler(async (req: AuthedRequest, res) => {
      await assertProjectAccess(db, req.auth!.userId, req.params["projectId"]!);
      const input = updateProjectSchema.parse(req.body);
      await db
        .update(projects)
        .set(pruneUndefined(input))
        .where(eq(projects.id, req.params["projectId"]!));
      res.status(204).send();
    }),
  );

  router.delete(
    "/:projectId",
    asyncHandler(async (req: AuthedRequest, res) => {
      // Only owner/admin of the org may delete.
      const member = (
        await db
          .select()
          .from(organizationMembers)
          .where(
            sql`${organizationMembers.organizationId} = (SELECT organization_id FROM projects WHERE id = ${req.params["projectId"]!})
                AND ${organizationMembers.userId} = ${req.auth!.userId}
                AND ${organizationMembers.role} IN ('owner','admin')`,
          )
          .limit(1)
      )[0];
      if (member === undefined && !(await isCreator(db, req.auth!.userId, req.params["projectId"]!))) {
        throw forbidden("Only owners can delete projects");
      }
      await db
        .update(projects)
        .set({ deletedAt: sql`now()` })
        .where(eq(projects.id, req.params["projectId"]!));
      res.status(204).send();
    }),
  );

  return router;
}

export function workspaceRoutes(db: Db): Router {
  const router = Router();

  router.post(
    "/project/:projectId/workspaces",
    asyncHandler(async (req: AuthedRequest, res) => {
      const projectId = req.params["projectId"]!;
      await assertProjectAccess(db, req.auth!.userId, projectId);
      const input = createWorkspaceSchema.parse(req.body);
      const created = (
        await db
          .insert(workspaces)
          .values({
            projectId,
            name: input.name,
            type: input.type,
            repositoryUrl: input.repositoryUrl ?? null,
            rootPath: input.rootPath ?? null,
            branch: input.branch ?? null,
            status: input.type === "local" ? "active" : "provisioning",
          })
          .returning()
      )[0];
      res.status(201).json(created);
    }),
  );

  router.get(
    "/project/:projectId/workspaces",
    asyncHandler(async (req: AuthedRequest, res) => {
      const projectId = req.params["projectId"]!;
      await assertProjectAccess(db, req.auth!.userId, projectId);
      const rows = await db.select().from(workspaces).where(eq(workspaces.projectId, projectId));
      res.json({ workspaces: rows });
    }),
  );

  router.get(
    "/workspaces/:workspaceId",
    asyncHandler(async (req: AuthedRequest, res) => {
      const wsId = req.params["workspaceId"]!;
      await assertWorkspaceAccess(db, req.auth!.userId, wsId);
      const row = (await db.select().from(workspaces).where(eq(workspaces.id, wsId)).limit(1))[0];
      if (row === undefined) throw notFound("Workspace");
      res.json(row);
    }),
  );

  router.patch(
    "/workspaces/:workspaceId",
    asyncHandler(async (req: AuthedRequest, res) => {
      const wsId = req.params["workspaceId"]!;
      await assertWorkspaceAccess(db, req.auth!.userId, wsId);
      const input = updateWorkspaceSchema.parse(req.body);
      await db.update(workspaces).set(pruneUndefined(input)).where(eq(workspaces.id, wsId));
      res.status(204).send();
    }),
  );

  router.delete(
    "/workspaces/:workspaceId",
    asyncHandler(async (req: AuthedRequest, res) => {
      const wsId = req.params["workspaceId"]!;
      await assertWorkspaceAccess(db, req.auth!.userId, wsId);
      await db.update(workspaces).set({ status: "destroyed" }).where(eq(workspaces.id, wsId));
      res.status(204).send();
    }),
  );

  return router;
}

async function isCreator(db: Db, userId: string, projectId: string): Promise<boolean> {
  const row = (
    await db.select({ createdBy: projects.createdBy }).from(projects).where(eq(projects.id, projectId)).limit(1)
  )[0];
  void z; // keep z import for future inline schemas
  return row?.createdBy === userId;
}
