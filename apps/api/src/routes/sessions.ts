/**
 * Session routes. Per CLAUDE.md §8. Creating a session also inserts the
 * creator as its owner in session_members (shared-session support).
 */

import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@openlobster/db";
import { sessionMembers, sessions } from "@openlobster/db/schema";
import { createSessionSchema, updateSessionSchema } from "@openlobster/validation";
import { asyncHandler, notFound, pruneUndefined } from "../lib/http";
import type { AuthedRequest } from "../middleware/auth";
import { assertProjectAccess, assertSessionAccess } from "../services/access";

export function sessionRoutes(db: Db): Router {
  const router = Router();

  router.post(
    "/project/:projectId/sessions",
    asyncHandler(async (req: AuthedRequest, res) => {
      const projectId = req.params["projectId"]!;
      const userId = req.auth!.userId;
      await assertProjectAccess(db, userId, projectId);
      const input = createSessionSchema.parse(req.body);

      const created = (
        await db
          .insert(sessions)
          .values({
            projectId,
            workspaceId: input.workspaceId,
            createdBy: userId,
            name: input.name,
            visibility: input.visibility,
          })
          .returning()
      )[0];
      if (created === undefined) throw new Error("session insert returned no rows");

      await db.insert(sessionMembers).values({
        sessionId: created.id,
        userId,
        role: "owner",
      });
      res.status(201).json(created);
    }),
  );

  router.get(
    "/project/:projectId/sessions",
    asyncHandler(async (req: AuthedRequest, res) => {
      const projectId = req.params["projectId"]!;
      await assertProjectAccess(db, req.auth!.userId, projectId);
      const page = Math.max(1, Number(req.query["page"] ?? 1));
      const limit = Math.min(100, Math.max(1, Number(req.query["limit"] ?? 20)));
      const rows = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.projectId, projectId), sql`${sessions.deletedAt} IS NULL`))
        .orderBy(sql`${sessions.createdAt} DESC`)
        .limit(limit)
        .offset((page - 1) * limit);
      res.json({ sessions: rows, page, limit });
    }),
  );

  router.get(
    "/sessions/:sessionId",
    asyncHandler(async (req: AuthedRequest, res) => {
      await assertSessionAccess(db, req.auth!.userId, req.params["sessionId"]!);
      const row = (
        await db
          .select()
          .from(sessions)
          .where(and(eq(sessions.id, req.params["sessionId"]!), sql`${sessions.deletedAt} IS NULL`))
          .limit(1)
      )[0];
      if (row === undefined) throw notFound("Session");
      res.json(row);
    }),
  );

  router.patch(
    "/sessions/:sessionId",
    asyncHandler(async (req: AuthedRequest, res) => {
      await assertSessionAccess(db, req.auth!.userId, req.params["sessionId"]!);
      const input = updateSessionSchema.parse(req.body);
      await db.update(sessions).set(pruneUndefined(input)).where(eq(sessions.id, req.params["sessionId"]!));
      res.status(204).send();
    }),
  );

  // Soft-delete/archive per CLAUDE.md §8.
  router.delete(
    "/sessions/:sessionId",
    asyncHandler(async (req: AuthedRequest, res) => {
      await assertSessionAccess(db, req.auth!.userId, req.params["sessionId"]!);
      await db
        .update(sessions)
        .set({ deletedAt: sql`now()`, status: "archived" })
        .where(eq(sessions.id, req.params["sessionId"]!));
      res.status(204).send();
    }),
  );

  return router;
}
