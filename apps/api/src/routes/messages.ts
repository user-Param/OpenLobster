/**
 * Message routes:
 *   POST /v1/sessions/:sessionId/messages  → start an agent run (202)
 *   GET  /v1/sessions/:sessionId/messages  → cursor-paginated history (§28)
 */

import { Router } from "express";
import { and, asc, eq, gt } from "drizzle-orm";
import type { Db } from "@openlobster/db";
import { messages } from "@openlobster/db/schema";
import { createMessageSchema } from "@openlobster/validation";
import { asyncHandler, notFound } from "../lib/http";
import type { AuthedRequest } from "../middleware/auth";
import { assertSessionAccess } from "../services/access";
import { assertContentOk, createMessageAndRun } from "../services/message-service";

export function messageRoutes(db: Db): Router {
  const router = Router();

  router.post(
    "/sessions/:sessionId/messages",
    asyncHandler(async (req: AuthedRequest, res) => {
      const sessionId = req.params["sessionId"]!;
      const input = createMessageSchema.parse(req.body);
      assertContentOk(input.content);

      // Idempotency-Key header wins over body field when both present.
      const idempotencyKey =
        (req.headers["idempotency-key"] as string | undefined) ?? input.idempotencyKey;

      const result = await createMessageAndRun(db, {
        userId: req.auth!.userId,
        sessionId,
        content: input.content,
        mode: input.mode,
        model: input.model,
        idempotencyKey,
      });
      res.status(202).json(result);
    }),
  );

  router.get(
    "/sessions/:sessionId/messages",
    asyncHandler(async (req: AuthedRequest, res) => {
      const sessionId = req.params["sessionId"]!;
      await assertSessionAccess(db, req.auth!.userId, sessionId);

      const cursor = req.query["cursor"] as string | undefined;
      const limit = Math.min(200, Math.max(1, Number(req.query["limit"] ?? 50)));

      const conditions = [eq(messages.sessionId, sessionId)];
      if (cursor !== undefined && cursor.length > 0) {
        // Cursor is the created_at timestamp of the last seen message.
        conditions.push(gt(messages.createdAt, new Date(cursor)));
      }

      const rows = await db
        .select()
        .from(messages)
        .where(and(...conditions))
        .orderBy(asc(messages.createdAt))
        .limit(limit + 1); // +1 to compute nextCursor

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0 ? (page[page.length - 1]?.createdAt.toISOString() ?? null) : null;

      res.json({
        messages: page.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          runId: m.runId,
          createdAt: m.createdAt.toISOString(),
        })),
        nextCursor,
      });
    }),
  );

  return router;
}
