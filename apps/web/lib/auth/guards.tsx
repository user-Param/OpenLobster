"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "./auth-context";

function isSafeNextPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

/** Full-screen placeholder shown while the persisted session is restoring. */
export function AuthGateSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center bg-background" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden
          className="size-2 animate-pulse-dot rounded-full bg-accent"
        />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/**
 * Renders children only for authenticated users; otherwise redirects to the
 * sign-in page preserving the intended destination. The backend remains the
 * authorization authority — this guard is UX routing only.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = isSafeNextPath(pathname) ? pathname : "/workspace";
      router.replace(`/signin?next=${encodeURIComponent(next)}`);
    }
  }, [status, router, pathname]);

  if (status !== "authenticated") {
    return <AuthGateSpinner label={status === "restoring" ? "Restoring session" : "Redirecting to sign in"} />;
  }

  return <>{children}</>;
}

/** Inverse guard for public auth pages: signed-in users go to `fallbackTo`. */
export function RedirectIfAuthenticated({
  children,
  fallbackTo,
}: {
  children: ReactNode;
  fallbackTo?: string;
}) {
  const { status } = useAuth();
  const router = useRouter();

  const target = fallbackTo !== undefined && isSafeNextPath(fallbackTo) ? fallbackTo : "/workspace";

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(target);
    }
  }, [status, router, target]);

  if (status === "authenticated") {
    return <AuthGateSpinner label="You are signed in" />;
  }

  return <>{children}</>;
}
