/**
 * JWT issuing/verification via jose. Per CLAUDE.md §2–5.
 *
 * Two token types with separate secrets:
 *   - access  (short TTL, sent as Bearer header)
 *   - refresh (long TTL, rotated at /auth/refresh)
 *
 * The access token carries userId + organizationId + role so protected
 * routes don't need a DB roundtrip for authorization checks. Refresh
 * tokens carry only userId + a jti used for denylist-based revocation.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface TokenConfig {
  readonly accessSecret: string;
  readonly refreshSecret: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;
}

export interface AccessTokenClaims extends JWTPayload {
  readonly sub: string; // userId
  readonly organizationId: string;
  readonly role: string; // OrganizationRole within that org
}

export interface RefreshTokenClaims extends JWTPayload {
  readonly sub: string; // userId
  readonly jti: string; // unique id for denylisting on logout
}

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number; // seconds until access token expiry
}

const ISSUER = "openlobster";
const AUDIENCE = "openlobster-api";

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function issueTokenPair(
  cfg: TokenConfig,
  params: { userId: string; organizationId: string; role: string },
): Promise<TokenPair> {
  const accessToken = await new SignJWT({ organizationId: params.organizationId, role: params.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${cfg.accessTtlSeconds}s`)
    .sign(key(cfg.accessSecret));

  const refreshToken = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setJti(crypto.randomUUID())
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${cfg.refreshTtlSeconds}s`)
    .sign(key(cfg.refreshSecret));

  return { accessToken, refreshToken, expiresIn: cfg.accessTtlSeconds };
}

export async function verifyAccessToken(
  cfg: TokenConfig,
  token: string,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(cfg.accessSecret), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      typeof payload.sub !== "string" ||
      typeof (payload as Partial<AccessTokenClaims>).organizationId !== "string"
    ) {
      return null;
    }
    return payload as AccessTokenClaims;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(
  cfg: TokenConfig,
  token: string,
): Promise<RefreshTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(cfg.refreshSecret), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== "string" || typeof payload.jti !== "string") {
      return null;
    }
    return payload as RefreshTokenClaims;
  } catch {
    return null;
  }
}
