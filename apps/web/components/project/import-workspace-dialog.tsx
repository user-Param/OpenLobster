"use client";

/**
 * Attach a remote repository workspace to an existing project. Used both by
 * the empty-state onboarding card and the project header.
 */

import { useState, type FormEvent } from "react";
import { GitBranchIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, TextInput } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { createWorkspace } from "@/lib/api/endpoints";
import type { Workspace } from "@/lib/api/types";

export function ImportWorkspaceDialog({
  open,
  projectId,
  onClose,
  onImported,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onImported: (workspace: Workspace) => void;
}) {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [errors, setErrors] = useState<{ repoUrl?: string; branch?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset(): void {
    setRepoUrl("");
    setBranch("");
    setErrors({});
    setFormError(null);
    setSubmitting(false);
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const nextErrors: typeof errors = {};
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
      const created = await createWorkspace(projectId, {
        name:
          parsedUrl?.pathname.split("/").pop()?.replace(/\.git$/, "").trim() || "imported-repository",
        type: "remote",
        repositoryUrl: repoUrl.trim(),
        ...(branch.trim().length > 0 ? { branch: branch.trim() } : {}),
      });
      reset();
      onImported(created);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not attach the repository.");
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
      description="Attaches the repository to this project as a remote workspace."
    >
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <div className="flex flex-col gap-4">
          <Field label="Repository URL" htmlFor="workspace-url" error={errors.repoUrl ?? null}>
            <TextInput
              id="workspace-url"
              inputMode="url"
              value={repoUrl}
              placeholder="https://github.com/org/repo.git"
              onChange={(event) => setRepoUrl(event.target.value)}
              invalid={errors.repoUrl !== undefined}
              disabled={submitting}
              required
            />
          </Field>
          <Field
            label="Branch"
            htmlFor="workspace-branch"
            error={errors.branch ?? null}
            hint="Optional; defaults to the repository default."
          >
            <TextInput
              id="workspace-branch"
              value={branch}
              maxLength={200}
              placeholder="main"
              onChange={(event) => setBranch(event.target.value)}
              invalid={errors.branch !== undefined}
              disabled={submitting}
            />
          </Field>
          {formError !== null ? (
            <p role="alert" className="flex items-center gap-2 text-sm text-danger">
              <GitBranchIcon size={13} /> {formError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Import Repository
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
