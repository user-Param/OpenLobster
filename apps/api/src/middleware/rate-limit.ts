/**
 * Redis fixed-window rate limiting middleware. Per CLAUDE.md §6C.
 * Keyed by userId when authenticated, else client IP.
 */

import type { Request, Response, NextFunction } from "express";
import type { RedisClient } from "@openlobster/redis";
import { rateLimit } from "@openlobster/redis";
import type { Logger } from "pino";
import { tooManyRequests } from "../lib/http";

export function rateLimitMiddleware(opts: {
  redis: RedisClient;
  logger: Logger;
  limit: number;
  windowSeconds: number;
  bucket: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as { auth?: { userId?: string } }).auth;
    const subject = auth?.userId ?? req.ip ?? "anonymous";
    void rateLimit(opts.redis, `${opts.bucket}:${subject}`, opts.limit, opts.windowSeconds)
      .then((result) => {
        if (!result.allowed) {
          res.setHeader("retry-after", String(result.resetSeconds));
          next(tooManyRequests(result.resetSeconds));
          return;
        }
        next();
      })
      .catch((err) => {
        // Fail open on limiter errors — availability over strictness for MVP,
        // but log loudly.
        opts.logger.warn({ err: (err as Error).message }, "rate limiter unavailable");
        next();
      });
  };
}
