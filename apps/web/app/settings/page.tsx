import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsHome } from "@/components/settings/settings-home";
import { RequireAuth } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <SettingsHome />
      </AppShell>
    </RequireAuth>
  );
}
