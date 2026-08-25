import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceHome } from "@/components/workspace/workspace-home";
import { RequireAuth } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Workspace" };

export default function WorkspacePage() {
  return (
    <RequireAuth>
      <AppShell>
        <WorkspaceHome />
      </AppShell>
    </RequireAuth>
  );
}
