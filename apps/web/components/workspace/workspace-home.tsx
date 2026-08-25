"use client";

/**
 * Project management area: the first screen after sign-in. Lists projects
 * and provides create / import / open / delete flows backed entirely by the
 * existing REST API. Import = create a project plus a remote workspace from
 * a repository URL (the web client has no local filesystem privileges).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ChevronRightIcon,
  FolderPlusIcon,
  GitBranchIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, TextArea, TextInput } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, SkeletonList } from "@/components/ui/states";
import { ApiError } from "@/lib/api/client";
import { createProject, createWorkspace, deleteProject, listProjects } from "@/lib/api/endpoints";
import type { ProjectSummary } from "@/lib/api/types";
import { useApiQuery } from "@/lib/hooks/use-api-query";

export function WorkspaceHome() {
  const query = useApiQuery<ProjectSummary[]>(() => listProjects().then((r) => r.projects), []);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);

  const projects = query.data;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a project or import a repository to start working with the agent.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <GitBranchIcon size={14} />
            Import Repository
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon size={14} />
            New Project
          </Button>
        </div>
      </header>

      {query.isLoading ? (
        <SkeletonList rows={4} />
      ) : query.error !== null ? (
        <ErrorState message={query.error.message} onRetry={query.refetch} />
      ) : projects === null || projects.length === 0 ? (
        <EmptyState
          icon={<FolderPlusIcon size={18} />}
          title="No projects yet"
          description="Create your first project or import an existing repository to open the agent workspace."
          action={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
                Import Repository
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                New Project
              </Button>
            </div>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((project) => (
            <li key={project.id}>
              <div className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
                <Link href={`/project/${project.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <GitBranchIcon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{project.name}</span>
                      {project.role === "owner" ? <Badge>owner</Badge> : null}
                    </span>
                    {project.description !== null && project.description.length > 0 ? (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {project.description}
                      </span>
                    ) : null}
                  </span>
                </Link>
                <button
                  type="button"
                  aria-label={`Delete project ${project.name}`}
                  title="Delete project"
                  className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => setDeleting(project)}
                >
                  <TrashIcon size={14} />
                </button>
                <ChevronRightIcon size={15} className="shrink-0 text-faint" />
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => query.refetch()}
      />
      <ImportProjectDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onCreated={() => query.refetch()}
      />
      <DeleteProjectDialog
        project={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          query.refetch();
        }}
      />
    </div>
  );
}

// --- New project -------------------------------------------------------------

function CreateProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset(): void {
    setName("");
    setDescription("");
    setFieldError(null);
    setFormError(null);
    setSubmitting(false);
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setFieldError("Project name is required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await createProject({
        name: trimmed,
        ...(description.trim().length > 0 ? { description: description.trim() } : {}),
      });
      onCreated();
      reset();
      onClose();
      router.push(`/project/${created.id}`);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Could not create the project.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) {
          reset();
          onClose();
        }
      }}
      title="New project"
      description="A project groups workspaces, sessions, and agent runs."
    >
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="new-project-name" error={fieldError}>
            <TextInput
              id="new-project-name"
              value={name}
              maxLength={120}
              placeholder="My SaaS app"
              autoFocus
              onChange={(event) => setName(event.target.value)}
              invalid={fieldError !== null}
              disabled={submitting}
              required
            />
          </Field>
          <Field label="Description" htmlFor="new-project-description" hint="Optional.">
            <TextArea
              id="new-project-description"
              value={description}
              maxLength={2000}
              placeholder="What is this codebase about?"
              onChange={(event) => setDescription(event.target.value)}
              disabled={submitting}
            />
          </Field>
          {formError !== null ? <p role="alert" className="text-sm text-danger">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Create Project
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

// --- Import repository ---------------------------------------------------------

function ImportProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [errors, setErrors] = useState<{ name?: string; repoUrl?: string; branch?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset(): void {
    setName("");
    setRepoUrl("");
    setBranch("");
    setErrors({});
    setFormError(null);
    setSubmitting(false);
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (name.trim().length === 0) nextErrors.name = "Project name is required.";
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(repoUrl.trim());
    } catch {
      parsedUrl = null;
    }
    if (parsedUrl === null || !["http:", "https:", "ssh:"].includes(parsedUrl.protocol)) {
      nextErrors.repoUrl = "Enter a valid repository URL (https or ssh).";
    }
    if (branch.trim().length > 200) nextErrors.branch = "Branch name is too long.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      // Backend contract: a session needs a workspace, so importing creates
      // both the project and its first remote workspace.
      const project = await createProject({ name: name.trim() });
      await createWorkspace(project.id, {
        name: parsedUrl?.pathname.split("/").pop()?.replace(/\.git$/, "") || `${name.trim()}-repo`,
        type: "remote",
        repositoryUrl: repoUrl.trim(),
        ...(branch.trim().length > 0 ? { branch: branch.trim() } : {}),
      });
      onCreated();
      reset();
      onClose();
      router.push(`/project/${project.id}`);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Could not import the repository.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) {
          reset();
          onClose();
        }
      }}
      title="Import repository"
      description="Creates a project and attaches the repository as a remote workspace."
    >
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <div className="flex flex-col gap-4">
          <Field label="Project name" htmlFor="import-name" error={errors.name ?? null}>
            <TextInput
              id="import-name"
              value={name}
              maxLength={120}
              placeholder="OpenLobster"
              onChange={(event) => setName(event.target.value)}
              invalid={errors.name !== undefined}
              disabled={submitting}
              required
            />
          </Field>
          <Field label="Repository URL" htmlFor="import-url" error={errors.repoUrl ?? null}>
            <TextInput
              id="import-url"
              inputMode="url"
              value={repoUrl}
              placeholder="https://github.com/org/repo.git"
              onChange={(event) => setRepoUrl(event.target.value)}
              invalid={errors.repoUrl !== undefined}
              disabled={submitting}
              required
            />
          </Field>
          <Field label="Branch" htmlFor="import-branch" error={errors.branch ?? null} hint="Optional; defaults to the repository default.">
            <TextInput
              id="import-branch"
              value={branch}
              maxLength={200}
              placeholder="main"
              onChange={(event) => setBranch(event.target.value)}
              invalid={errors.branch !== undefined}
              disabled={submitting}
            />
          </Field>
          {formError !== null ? <p role="alert" className="text-sm text-danger">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Import
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

// --- Delete confirmation ---------------------------------------------------------

function DeleteProjectDialog({
  project,
  onClose,
  onDeleted,
}: {
  project: ProjectSummary | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete(): Promise<void> {
    if (project === null) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteProject(project.id);
      onDeleted();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 403
            ? "Only project owners can delete projects."
            : err.message
          : "Could not delete the project.",
      );
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={project !== null}
      onClose={() => {
        if (!deleting) {
          setError(null);
          onClose();
        }
      }}
      title={`Delete “${project?.name ?? ""}”?`}
      description="The project is archived and will no longer appear in your workspace. This cannot be undone from the UI."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" loading={deleting} onClick={() => void confirmDelete()}>
            Delete Project
          </Button>
        </div>
      }
    >
      {error !== null ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
