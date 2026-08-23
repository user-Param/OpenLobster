/**
 * Model + usage + user routes (§29–30).
 *   GET /v1/models   available models given configured providers
 *   GET /v1/usage    current-month usage summary for the caller
 */

import { Router } from "express";
import { sql } from "drizzle-orm";
import type { AppConfig } from "@openlobster/config";
import type { Db } from "@openlobster/db";
import { users } from "@openlobster/db/schema";
import { eq } from "drizzle-orm";
import { ModelGateway } from "@openlobster/models";
import { asyncHandler, notFound } from "../lib/http";
import type { AuthedRequest } from "../middleware/auth";

export function miscRoutes(cfg: AppConfig, db: Db): Router {
  const router = Router();

  router.get(
    "/models",
    asyncHandler(async (_req, res) => {
      // Stateless: derive availability from the configured provider keys.
      const gateway = new ModelGateway(cfg);
      res.json({
        models: gateway.availableModels().map((m) => ({
          id: m.id,
          provider: m.provider,
          contextWindow: m.contextWindow,
          maxOutputTokens: m.maxOutputTokens,
          capabilities: m.capabilities,
          type: "cloud",
        })),
      });
    }),
  );

  router.get(
    "/usage",
    asyncHandler(async (req: AuthedRequest, res) => {
      const row = (
        await db.execute<{
          input_tokens: string;
          output_tokens: string;
          total_tokens: string;
          total_cost: string;
          runs: string;
        }>(
          sql`SELECT coalesce(sum(input_tokens),0)::text AS input_tokens,
                     coalesce(sum(output_tokens),0)::text AS output_tokens,
                     coalesce(sum(total_tokens),0)::text AS total_tokens,
                     coalesce(sum(total_cost),0)::text AS total_cost,
                     count(DISTINCT run_id)::text AS runs
              FROM usage_records
              WHERE user_id = ${req.auth!.userId}
                AND date_trunc('month', created_at) = date_trunc('month', now())`,
        )
      )[0];
      res.json({
        period: new Date().toISOString().slice(0, 7),
        inputTokens: Number(row?.input_tokens ?? 0),
        outputTokens: Number(row?.output_tokens ?? 0),
        totalTokens: Number(row?.total_tokens ?? 0),
        estimatedCostUsd: Number(row?.total_cost ?? 0),
        runs: Number(row?.runs ?? 0),
      });
    }),
  );

  router.get(
    "/users/me",
    asyncHandler(async (req: AuthedRequest, res) => {
      const row = (
        await db
          .select({ id: users.id, email: users.email, name: users.name, avatarUrl: users.avatarUrl })
          .from(users)
          .where(eq(users.id, req.auth!.userId))
          .limit(1)
      )[0];
      if (row === undefined) throw notFound("User");
      res.json({ user: row, organizationId: req.auth!.organizationId, role: req.auth!.role });
    }),
  );

  return router;
}
