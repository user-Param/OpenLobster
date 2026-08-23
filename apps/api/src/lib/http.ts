/**
 * Small HTTP helpers: typed errors + async wrapper so route handlers can be
 * plain async functions and rejections still reach the error middleware.
 */

import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg, "bad_request");
export const unauthorized = (msg = "Authentication required") => new HttpError(401, msg, "unauthorized");
export const forbidden = (msg = "Forbidden") => new HttpError(403, msg, "forbidden");
export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`, "not_found");
export const conflict = (msg: string) => new HttpError(409, msg, "conflict");
export const tooManyRequests = (retryAfterSeconds: number) =>
  new HttpError(429, `Rate limited; retry after ${retryAfterSeconds}s`, "rate_limited");

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Removes undefined-valued keys (exactOptionalPropertyTypes-safe for
 * drizzle `.set()`): every surviving key is required with `undefined`
 * excluded from its type.
 */
export function pruneUndefined<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]-?: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as { [K in keyof T]-?: Exclude<T[K], undefined> };
}
