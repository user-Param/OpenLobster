/**
 * Express app factory. Middleware chain per CLAUDE.md §1:
 *   requestId → json body → auth → routes → 404 → error handler
 *
 * Route-level rate limiting is applied where it matters (message creation).
 */

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { AppConfig } from "@openlobster/config";
import type { Db } from "@openlobster/db";
import { closeDb } from "@openlobster/db";
import { closeRedis, type RedisClient } from "@openlobster/redis";
import type { Logger } from "pino";
import { HttpError } from "./lib/http";
import { requireAuth } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { authRoutes } from "./routes/auth";
import { projectRoutes, workspaceRoutes } from "./routes/projects";
import { sessionRoutes } from "./routes/sessions";
import { messageRoutes } from "./routes/messages";
import { runRoutes } from "./routes/runs";
import { miscRoutes } from "./routes/misc";

export interface AppDeps {
  readonly cfg: AppConfig;
  readonly db: Db;
  readonly redis: RedisClient;
  readonly logger: Logger;
}

export function buildApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");

  // --- request id + basic logging -----------------------------------------
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
    req.headers["x-request-id"] = requestId;
    res.setHeader("x-request-id", requestId);
    const start = Date.now();
    res.on("finish", () => {
      deps.logger.info(
        { requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start },
        "request",
      );
    });
    next();
  });

  app.use(express.json({ limit: "2mb" }));

  // --- global rate limit (per IP) -------------------------------------------
  app.use(
    rateLimitMiddleware({
      redis: deps.redis,
      logger: deps.logger,
      bucket: "api",
      limit: 600,
      windowSeconds: 60,
    }),
  );

  // --- health -----------------------------------------------------------------
  app.get("/healthz", async (_req, res) => {
    const dbUp = await deps.db.execute("SELECT 1").then(
      () => true,
      () => false,
    );
    const redisUp = await deps.redis.ping().then(
      () => true,
      () => false,
    );
    res.status(dbUp && redisUp ? 200 : 503).json({ ok: dbUp && redisUp, db: dbUp, redis: redisUp });
  });

  // --- API v1 -------------------------------------------------------------------
  const v1 = express.Router();

  // Public
  v1.use("/auth", authRoutes({ cfg: deps.cfg, db: deps.db, redis: deps.redis }));

  // Authenticated
  v1.use(requireAuth(deps.cfg));
  v1.use("/projects", projectRoutes(deps.db));
  v1.use("/", workspaceRoutes(deps.db));
  v1.use("/", sessionRoutes(deps.db));

  // Message creation is the expensive path — tight per-user budget.
  v1.post(
    "/sessions/:sessionId/messages",
    rateLimitMiddleware({
      redis: deps.redis,
      logger: deps.logger,
      bucket: "messages",
      limit: 30,
      windowSeconds: 3600,
    }),
  );
  v1.use("/", messageRoutes(deps.db));

  v1.use("/", runRoutes({ db: deps.db, redis: deps.redis, redisUrl: deps.cfg.redis.url }));
  v1.use("/", miscRoutes(deps.cfg, deps.db));

  app.use("/v1", v1);

  // --- 404 + error handler -------------------------------------------------------
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "not_found", message: "Route not found" });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code ?? "error", message: err.message });
      return;
    }
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      res.status(400).json({
        error: "validation_error",
        message: `${issue?.path.join(".") ?? "body"}: ${issue?.message ?? "invalid"}`,
      });
      return;
    }
    if (isBodyParseError(err)) {
      res.status(400).json({ error: "invalid_json", message: "Request body is not valid JSON" });
      return;
    }
    deps.logger.error({ err: err instanceof Error ? err.stack : String(err) }, "unhandled error");
    res.status(500).json({ error: "internal_error", message: "Internal server error" });
  });

  // Exposed for graceful shutdown in server.ts.
  app.set("shutdown", async () => {
    await closeRedis();
    await closeDb();
  });

  return app;
}

function isBodyParseError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type?: string }).type === "entity.parse.failed"
  );
}
