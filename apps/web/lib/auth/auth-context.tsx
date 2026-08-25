"use client";

/**
 * Authentication context: session restoration, sign in/out/up, and wiring
 * between the API client's 401-refresh flow and persisted credentials.
 *
 * The backend owns all authorization; this layer only reflects it in the UI.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { configureApiClient } from "@/lib/api/client";
import { fetchCurrentUser, logout, refreshTokens, signIn, signUp } from "@/lib/api/endpoints";
import type { AuthUser } from "@/lib/api/types";
import {
  adoptExternalTokenChanges,
  clearTokens,
  getAccessToken as readAccessToken,
  getRefreshToken,
  hasStoredSession,
  persistRefreshToken,
  setTokens,
} from "./token-store";

export type AuthStatus = "restoring" | "authenticated" | "unauthenticated";

export interface CredentialsInput {
  email: string;
  password: string;
}

export interface SignUpCredentialsInput extends CredentialsInput {
  name: string;
}

interface AuthContextValue {
  readonly status: AuthStatus;
  readonly user: AuthUser | null;
  signIn: (input: CredentialsInput) => Promise<void>;
  signUp: (input: SignUpCredentialsInput) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [user, setUser] = useState<AuthUser | null>(null);
  // Latest-status ref for callbacks registered once (synced via effect).
  const statusRef = useRef<AuthStatus>("restoring");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const markUnauthenticated = useCallback(() => {
    clearTokens();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  /**
   * Exchange the stored refresh token for a fresh token pair.
   * Shared by boot restoration and the API client's 401 flow.
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    const refreshToken = getRefreshToken();
    if (refreshToken === null) return false;
    try {
      const pair = await refreshTokens(refreshToken);
      setTokens({ accessToken: pair.accessToken, refreshToken: pair.refreshToken });
      persistRefreshToken(pair.refreshToken);
      return true;
    } catch {
      markUnauthenticated();
      return false;
    }
  }, [markUnauthenticated]);

  // Register client hooks + restore any persisted session exactly once.
  useEffect(() => {
    configureApiClient({
      getAccessToken: readAccessToken,
      refreshSession,
      onSessionExpired: markUnauthenticated,
    });

    let cancelled = false;
    async function restore(): Promise<void> {
      if (!hasStoredSession()) {
        setStatus("unauthenticated");
        return;
      }
      const ok = await refreshSession();
      if (!ok || cancelled) return;
      try {
        const me = await fetchCurrentUser();
        if (cancelled) return;
        setUser(me.user);
        setStatus("authenticated");
      } catch {
        if (!cancelled) markUnauthenticated();
      }
    }
    void restore();

    // Adopt cross-tab credential changes: signed out elsewhere -> sign out here.
    const unsubscribe = adoptExternalTokenChanges((refreshToken) => {
      if (refreshToken === null && statusRef.current === "authenticated") {
        markUnauthenticated();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refreshSession, markUnauthenticated]);

  const signInHandler = useCallback(
    async (input: CredentialsInput): Promise<void> => {
      const response = await signIn(input);
      setTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken });
      persistRefreshToken(response.refreshToken);
      setUser(response.user);
      setStatus("authenticated");
    },
    [],
  );

  const signUpHandler = useCallback(async (input: SignUpCredentialsInput): Promise<void> => {
    const response = await signUp(input);
    setTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken });
    persistRefreshToken(response.refreshToken);
    setUser(response.user);
    setStatus("authenticated");
  }, []);

  const signOutHandler = useCallback(async (): Promise<void> => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken !== null) await logout(refreshToken);
    } catch {
      // Server-side revocation is best-effort; local state is authoritative.
    }
    markUnauthenticated();
  }, [markUnauthenticated]);

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        signIn: signInHandler,
        signUp: signUpHandler,
        signOut: signOutHandler,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
