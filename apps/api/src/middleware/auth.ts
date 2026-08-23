/**
 * Auth middleware: verifies the Bearer access token and attaches
 * { userId, organizationId, role } to the request.
 */

import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "@openlobster/config";
import { verifyAccessToken } from "@openlobster/auth";
import { unauthorized } from "../lib/http";

export interface AuthedRequest extends Request {
  auth?: {
    userId: string;
    organizationId: string;
    role: string;
  };
}

export function requireAuth(cfg: AppConfig) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const header = req.headers["authorization"];
    if (header === undefined || !header.startsWith("Bearer ")) {
      next(unauthorized());
      return;
    }
    void verifyAccessToken(
      {
        accessSecret: cfg.auth.jwtSecret,
        refreshSecret: cfg.auth.jwtRefreshSecret,
        accessTtlSeconds: cfg.auth.accessTtlSeconds,
        refreshTtlSeconds: cfg.auth.refreshTtlSeconds,
      },
      header.slice("Bearer ".length),
    ).then((claims) => {
      if (claims === null) {
        next(unauthorized("Invalid or expired token"));
        return;
      }
      req.auth = {
        userId: claims.sub,
        organizationId: claims.organizationId as unknown as string,
        role: String(claims.role ?? "member"),
      };
      next();
    });
  };
}
