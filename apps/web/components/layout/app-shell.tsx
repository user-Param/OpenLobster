"use client";

/**
 * Shell for authenticated areas: persistent sidebar on desktop, slide-in
 * drawer on mobile. Navigation stays minimal per DESIGN.md — projects,
 * settings, account.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  FolderPlusIcon,
  LogOutIcon,
  MenuIcon,
  SettingsIcon,
  XIcon,
} from "@/components/icons";
import { useAuth } from "@/lib/auth/auth-context";

const NAV_ITEMS: ReadonlyArray<{ href: string; label: string; icon: ReactNode }> = [
  { href: "/workspace", label: "Workspace", icon: <FolderPlusIcon size={15} /> },
  { href: "/settings", label: "Settings", icon: <SettingsIcon size={15} /> },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const closeDrawer = (): void => setDrawerOpen(false);

  const nav = (
    <nav aria-label="Application" className="flex flex-1 flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/workspace" ? pathname.startsWith("/workspace") || pathname.startsWith("/project") : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={closeDrawer}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-accent-soft font-medium text-accent"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebarBody = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Link
          href="/workspace"
          aria-label="OpenLobster workspace"
          className="rounded-md"
          onClick={closeDrawer}
        >
          <Logo size={19} />
        </Link>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
          onClick={closeDrawer}
          aria-label="Close menu"
        >
          <XIcon size={16} />
        </button>
      </div>
      {nav}
      <UserBlock />
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-1">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        {sidebarBody}
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-background/90 px-3 backdrop-blur md:hidden">
        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
        >
          <MenuIcon size={18} />
        </button>
        <Link href="/workspace" aria-label="OpenLobster workspace">
          <Logo size={17} />
        </Link>
        <span className="w-9" aria-hidden />
      </div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-overlay animate-fade-in"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-surface shadow-2xl animate-fade-in">
            {sidebarBody}
          </aside>
        </div>
      ) : null}

      <main className="flex min-h-dvh flex-1 flex-col pt-12 md:min-w-0 md:pt-0">{children}</main>
    </div>
  );
}

function UserBlock() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="border-t border-border p-3">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
          {initials(user?.name ?? user?.email ?? "?")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-foreground">
            {user?.name ?? "Account"}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">{user?.email}</span>
        </span>
      </div>
      <div className="flex items-center justify-between">
        <ThemeToggle />
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => {
            setSigningOut(true);
            void signOut();
          }}
          disabled={signingOut}
        >
          <LogOutIcon size={13} />
          Sign out
        </button>
      </div>
    </div>
  );
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0 || parts[0] === "") return "?";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}
