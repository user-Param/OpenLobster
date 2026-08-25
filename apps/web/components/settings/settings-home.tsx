"use client";

/**
 * Settings: account, usage summary, available models, appearance, sign out.
 * Everything reflects existing backend endpoints (/users/me, /usage,
 * /models); nothing here mutates beyond the supported logout + local theme.
 */

import { useState } from "react";
import { LobsterMark, Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, SkeletonList } from "@/components/ui/states";
import { fetchCurrentUser, fetchModels, fetchUsage } from "@/lib/api/endpoints";
import { useApiQuery } from "@/lib/hooks/use-api-query";
import type { CurrentUserResponse } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { formatTokenCount, formatUsd } from "@/lib/format";

export function SettingsHome() {
  const { user, organizationId, role } = useAccountInfo();
  const usageQuery = useApiQuery(() => fetchUsage(), []);
  const modelsQuery = useApiQuery(() => fetchModels().then((result) => result.models), []);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Account, usage, and appearance.</p>
      </header>

      <div className="flex flex-col gap-4">
        {/* Account */}
        <section aria-labelledby="settings-account" className="rounded-xl border border-border bg-surface p-5">
          <h2 id="settings-account" className="text-sm font-semibold">
            Account
          </h2>
          <div className="mt-4 flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft">
              <LobsterMark size={22} tone="accent" />
            </span>
            {user === null ? (
              <SkeletonList rows={1} itemHeight="h-9" />
            ) : (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            )}
          </div>
          {organizationId !== null ? (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <dt>Organization</dt>
              <dd className="truncate font-mono">{organizationId}</dd>
              <dt>Role</dt>
              <dd>{role ?? "member"}</dd>
            </dl>
          ) : null}
        </section>

        {/* Usage */}
        <section aria-labelledby="settings-usage" className="rounded-xl border border-border bg-surface p-5">
          <h2 id="settings-usage" className="text-sm font-semibold">
            Usage this month
          </h2>
          {usageQuery.isLoading ? (
            <div className="mt-4">
              <SkeletonList rows={1} itemHeight="h-16" />
            </div>
          ) : usageQuery.error !== null ? (
            <ErrorState compact message={usageQuery.error.message} onRetry={usageQuery.refetch} />
          ) : usageQuery.data !== null ? (
            <>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <Metric label="Tokens" value={formatTokenCount(usageQuery.data.totalTokens)} />
                <Metric label="Runs" value={String(usageQuery.data.runs)} />
                <Metric label="Est. cost" value={formatUsd(usageQuery.data.estimatedCostUsd)} />
              </div>
              <p className="mt-3 text-center text-[11px] text-faint">Period {usageQuery.data.period}</p>
            </>
          ) : null}
        </section>

        {/* Models */}
        <section aria-labelledby="settings-models" className="rounded-xl border border-border bg-surface p-5">
          <h2 id="settings-models" className="text-sm font-semibold">
            Available models
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Provided by the configured Model Gateway providers.
          </p>
          {modelsQuery.isLoading ? (
            <div className="mt-4">
              <SkeletonList rows={2} itemHeight="h-10" />
            </div>
          ) : modelsQuery.error !== null ? (
            <ErrorState compact message={modelsQuery.error.message} onRetry={modelsQuery.refetch} />
          ) : (modelsQuery.data?.length ?? 0) === 0 ? (
            <p className="mt-4 text-xs text-muted-foreground">
              No providers are configured on the server yet.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {(modelsQuery.data ?? []).map((model) => (
                <li
                  key={model.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2"
                >
                  <span className="font-mono text-xs">{model.id}</span>
                  <Badge>{model.provider}</Badge>
                  <span className="ml-auto text-[11px] text-faint">
                    {(model.contextWindow / 1000).toFixed(0)}k context
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Appearance */}
        <section aria-labelledby="settings-appearance" className="rounded-xl border border-border bg-surface p-5">
          <h2 id="settings-appearance" className="text-sm font-semibold">
            Appearance
          </h2>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Switch between dark and light themes.</p>
            <ThemeToggle className="border border-border" />
          </div>
        </section>

        <SignOutRow />
      </div>

      <footer className="mt-10 flex items-center justify-center gap-2 text-xs text-faint">
        <Logo size={14} withWordmark={false} />
        OpenLobster
      </footer>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-2 py-3">
      <p className="text-base font-semibold">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function SignOutRow() {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  return (
    <section className="flex items-center justify-between rounded-xl border border-border bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold">Sign out</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Ends your session and revokes the refresh token.
        </p>
      </div>
      <Button
        variant="secondary"
        onClick={() => {
          setSigningOut(true);
          void signOut();
        }}
        loading={signingOut}
      >
        Sign out
      </Button>
    </section>
  );
}

/** Account info comes straight from the auth context; /users/me fills org data. */
function useAccountInfo(): {
  user: { name: string; email: string } | null;
  organizationId: string | null;
  role: string | null;
} {
  const { user } = useAuth();
  const meQuery = useApiQuery<CurrentUserResponse>(() => fetchCurrentUser(), []);

  return {
    user: user !== null ? { name: user.name, email: user.email } : null,
    organizationId: meQuery.data?.organizationId ?? null,
    role: meQuery.data?.role ?? null,
  };
}
