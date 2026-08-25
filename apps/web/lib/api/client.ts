/**
 * Minimal same-origin API client for the OpenLobster REST API.
 *
 * All requests go through the Next.js rewrite `/api/v1/:path*` -> Express
 * `/v1/:path*`, so no CORS surface exists and no backend origin leaks into
 * client code. Authentication uses Bearer access tokens; a single-flight
 * refresh flow retries once after a 401.
 *
 * Error contract: the backend always returns `{ error, message }` on failure.
 */

import { getAccessToken } from "@/lib/auth/token-store";

const BASE_PATH = "/api/v1";

export class ApiError extends Error {
  readonly status: number;
  /** Backend machine-readable code, e.g. "validation_error". */
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface ApiClientHooks {
  getAccessToken: () => string | null;
  /** Attempt to obtain a fresh access token. Resolves true on success. */
  refreshSession: () => Promise<boolean>;
  /** Called when the session is definitively unusable (refresh failed). */
  onSessionExpired: () => void;
}

let hooks: ApiClientHooks | null = null;

export function configureApiClient(next: ApiClientHooks): void {
  hooks = next;
}

let refreshInFlight: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
  if (!hooks) return Promise.resolve(false);
  if (refreshInFlight === null) {
    refreshInFlight = hooks.refreshSession().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /**
   * Value for the backend's Idempotency-Key header (used when starting runs).
   */
  idempotencyKey?: string;
  /**
   * Skip the automatic 401 -> refresh -> retry flow (used by auth endpoints).
   */
  skipAuthRetry?: boolean;
}

function buildHeaders(init: RequestOptions, token: string | null): Headers {
  const headers = new Headers();
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (token !== null) headers.set("Authorization", `Bearer ${token}`);
  if (init.idempotencyKey !== undefined) headers.set("Idempotency-Key", init.idempotencyKey);
  headers.set("Accept", "application/json");
  return headers;
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  let code = "error";
  let message = "Something went wrong. Please try again.";
  try {
    const data: unknown = await response.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      "message" in data &&
      typeof (data as { error: unknown }).error === "string" &&
      typeof (data as { message: unknown }).message === "string"
    ) {
      code = (data as { error: string }).error;
      message = (data as { message: string }).message;
    }
  } catch {
    // Non-JSON error body — keep defaults.
  }
  if (response.status === 0 || response.status >= 500) {
    // Never surface raw infrastructure errors to users.
    message = response.status >= 500 ? "OpenLobster is having trouble right now. Please try again." : message;
  }
  if (response.status === 401 && code === "unauthorized") {
    message = "Your session has expired. Please sign in again.";
  }
  return new ApiError(response.status, code, message);
}

function toNetworkError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiError(499, "cancelled", "Request cancelled");
  }
  return new ApiError(0, "network_error", "Could not reach OpenLobster. Check your connection and try again.");
}

async function execute<T>(path: string, init: RequestOptions, token: string | null): Promise<T> {
  const method = init.method ?? "GET";
  let response: Response;
  try {
    response = await fetch(`${BASE_PATH}${path}`, {
      method,
      headers: buildHeaders(init, token),
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
      cache: "no-store",
    });
  } catch (error) {
    throw toNetworkError(error);
  }

  if (response.status === 204) return undefined as T;

  if (!response.ok) throw await parseErrorResponse(response);

  if (response.status === 202) {
    const text = await response.text();
    return (text.length > 0 ? JSON.parse(text) : undefined) as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, "bad_response", "Received an unexpected response from the server.");
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const first = await execute<T>(path, options, hooks?.getAccessToken() ?? getAccessToken()).catch(
    (error: unknown) => {
      throw toNetworkError(error);
    },
  );
  return first;
}

/**
 * Request wrapper with the full auth lifecycle: attaches the current access
 * token, and on 401 performs a single-flight session refresh then retries
 * exactly once before surfacing the error.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const authHooks = hooks;
  if (authHooks === null || path.startsWith("/auth/")) {
    // No auth layer installed (or a public route): plain request semantics.
    return execute<T>(path, options, getAccessToken()).catch((error: unknown) => {
      throw toNetworkError(error);
    });
  }

  try {
    return await execute<T>(path, options, authHooks.getAccessToken());
  } catch (error) {
    const apiError = toNetworkError(error);
    if (apiError.status !== 401 || options.skipAuthRetry === true) {
      if (apiError.status === 401) authHooks.onSessionExpired();
      throw apiError;
    }

    const refreshed = await refreshOnce();
    if (!refreshed) {
      authHooks.onSessionExpired();
      throw apiError;
    }
    return execute<T>(path, options, authHooks.getAccessToken()).catch((e: unknown) => {
      throw toNetworkError(e);
    });
  }
}
