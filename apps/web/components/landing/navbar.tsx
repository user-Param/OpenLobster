"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/** Public landing navigation. Anchors scroll; auth links route to the app. */
export function LandingNavbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6"
      >
        <Link href="/#top" className="rounded-md" aria-label="OpenLobster home">
          <Logo size={20} />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/#capabilities"
            className="hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Product
          </Link>
          <Link
            href="/#how-it-works"
            className="hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            How it works
          </Link>
          <ThemeToggle />
          <Link
            href="/signin"
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-8 items-center rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            Start
          </Link>
        </div>
      </nav>
    </header>
  );
}
