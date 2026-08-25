"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ThemeProvider } from "@/lib/theme/theme-context";

/** Client providers mounted once from the root layout. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
