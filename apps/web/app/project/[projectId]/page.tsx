import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectWorkspace } from "@/components/project/project-workspace";
import { RequireAuth } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <RequireAuth>
      <AppShell>
        <ProjectWorkspace projectId={projectId} />
      </AppShell>
    </RequireAuth>
  );
}
