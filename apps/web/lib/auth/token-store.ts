/**
 * Client-side credential store.
 *
 * Security model (per DESIGN.md):
 *   - Only the long-lived refresh token is persisted (localStorage) because
 *     persistent login requires it. It is never logged or rendered.
 *   - The short-lived access token lives in module memory only, so it is not
 *     written to browser storage unnecessarily.
 *
 * Cross-tab note: the backend rotates refresh tokens. A `storage` listener
 * lets tabs adopt a newer rotated token issued by another tab, which avoids
 * most multi-tab invalidation races.
 */

const REFRESH_TOKEN_KEY = "openlobster.refresh";

let accessToken: string | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setTokens(params: { accessToken: string; refreshToken: string }): void {
  accessToken = params.accessToken;
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, params.refreshToken);
  } catch {
    // Storage unavailable (private mode etc.) — session simply won't persist.
  }
}

export function clearTokens(): void {
  accessToken = null;
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Ignore — nothing else to do.
  }
}

export function hasStoredSession(): boolean {
  return getRefreshToken() !== null;
}

/**
 * Listen for refresh-token writes made by other tabs and adopt them.
 * Returns an unsubscribe function.
 */
export function adoptExternalTokenChanges(onAdopt: (refreshToken: string | null) => void): () => void {
  if (!isBrowser()) return () => undefined;
  const listener = (event: StorageEvent): void => {
    if (event.key !== REFRESH_TOKEN_KEY) return;
    if (event.storageArea !== window.localStorage) return;
    onAdopt(event.newValue);
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

/** Overwrite the persisted refresh token without touching the access token. */
export function persistRefreshToken(refreshToken: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    // Ignore.
  }
}
