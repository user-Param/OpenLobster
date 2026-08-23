/**
 * Auth routes. Per CLAUDE.md §2–5:
 *   POST /v1/auth/signup    create user + org + membership + tokens
 *   POST /v1/auth/login     verify credentials, issue tokens
 *   POST /v1/auth/refresh   rotate tokens (old refresh jti denylisted)
 *   POST /v1/auth/logout    denylist the presented refresh token
 */

import { Router } from "express";
import { and, eq, gt, sql } from "drizzle-orm";
import type { AppConfig } from "@openlobster/config";
import type { Db } from "@openlobster/db";
import { organizationMembers, organizations, users } from "@openlobster/db/schema";
import {
  hashPassword,
  issueTokenPair,
  verifyPassword,
  verifyRefreshToken,
  type TokenConfig,
} from "@openlobster/auth";
import type { RedisClient } from "@openlobster/redis";
import { loginSchema, refreshSchema, signupSchema } from "@openlobster/validation";
import { conflict, unauthorized } from "../lib/http";
import { asyncHandler } from "../lib/http";

const DENYLIST_PREFIX = "auth:denylist:jti:";

function tokenConfig(cfg: AppConfig): TokenConfig {
  return {
    accessSecret: cfg.auth.jwtSecret,
    refreshSecret: cfg.auth.jwtRefreshSecret,
    accessTtlSeconds: cfg.auth.accessTtlSeconds,
    refreshTtlSeconds: cfg.auth.refreshTtlSeconds,
  };
}

export function authRoutes(opts: {
  cfg: AppConfig;
  db: Db;
  redis: RedisClient;
}): Router {
  const router = Router();
  const { cfg, db, redis } = opts;
  const tokens = tokenConfig(cfg);

  router.post(
    "/signup",
    asyncHandler(async (req, res) => {
      const input = signupSchema.parse(req.body);

      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
      if (existing.length > 0) throw conflict("Email already registered");

      const passwordHash = await hashPassword(input.password);
      const user = (
        await db.insert(users).values({ email: input.email, passwordHash, name: input.name }).returning()
      )[0];
      if (user === undefined) throw new Error("user insert returned no rows");

      // Personal organization per signup (CLAUDE.md server flow §2).
      const slugBase = `${input.email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "org"}`;
      const org = (
        await db
          .insert(organizations)
          .values({
            name: `${input.name}'s Org`,
            slug: `${slugBase}-${user.id.slice(0, 8)}`,
          })
          .returning()
      )[0];
      if (org === undefined) throw new Error("org insert returned no rows");

      await db.insert(organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        role: "owner",
      });

      const pair = await issueTokenPair(tokens, {
        userId: user.id,
        organizationId: org.id,
        role: "owner",
      });
      res.status(201).json({
        user: { id: user.id, email: user.email, name: user.name },
        ...pair,
      });
    }),
  );

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const input = loginSchema.parse(req.body);
      const rows = await db
        .select()
        .from(users)
        .where(and(eq(users.email, input.email), sql`${users.deletedAt} IS NULL`))
        .limit(1);
      const user = rows[0];
      // Constant-shape failure: same error whether email or password is wrong.
      const ok =
        user !== undefined && (await verifyPassword(user.passwordHash, input.password));
      if (!ok) throw unauthorized("Invalid email or password");

      const membership = (
        await db
          .select()
          .from(organizationMembers)
          .where(eq(organizationMembers.userId, user!.id))
          .limit(1)
      )[0];

      const pair = await issueTokenPair(tokens, {
        userId: user!.id,
        organizationId: membership?.organizationId ?? "",
        role: membership?.role ?? "member",
      });
      res.json({ user: { id: user!.id, email: user!.email, name: user!.name }, ...pair });
    }),
  );

  router.post(
    "/refresh",
    asyncHandler(async (req, res) => {
      const input = refreshSchema.parse(req.body);
      const claims = await verifyRefreshToken(tokens, input.refreshToken);
      if (claims === null) throw unauthorized("Invalid refresh token");

      // Denylist check (logout/rotation revocation).
      const denied = await redis.get(`${DENYLIST_PREFIX}${claims.jti}`);
      if (denied !== null) throw unauthorized("Refresh token revoked");

      // Re-resolve org/role from the DB so role changes propagate on refresh.
      const membership = (
        await db
          .select()
          .from(organizationMembers)
          .where(eq(organizationMembers.userId, claims.sub))
          .limit(1)
      )[0];
      if (membership === undefined) throw unauthorized("User has no organization");
      void req.headers["x-org"]; // header hint unused; DB is authoritative

      // Rotate: denylist old jti until its natural expiry.
      await redis
        .set(`${DENYLIST_PREFIX}${claims.jti}`, "1", "EX", cfg.auth.refreshTtlSeconds)
        .catch(() => undefined);

      const pair = await issueTokenPair(tokens, {
        userId: claims.sub,
        organizationId: membership.organizationId,
        role: membership.role,
      });
      res.json(pair);
    }),
  );

  router.post(
    "/logout",
    asyncHandler(async (req, res) => {
      const input = refreshSchema.parse(req.body);
      const claims = await verifyRefreshToken(tokens, input.refreshToken);
      if (claims !== null) {
        await redis
          .set(`${DENYLIST_PREFIX}${claims.jti}`, "1", "EX", cfg.auth.refreshTtlSeconds)
          .catch(() => undefined);
      }
      res.status(204).send();
    }),
  );

  return router;
}

// keep `gt` import used for future expiry-window optimizations
void gt;
