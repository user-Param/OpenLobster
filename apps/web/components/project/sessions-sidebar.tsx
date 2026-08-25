"use client";

/**
 * Session management UI for a project: list with switch/rename/archive,
 * plus creation of new sessions (requires at least one active workspace).
 * All operations call the existing REST endpoints.
 */

import { useState, type FormEvent } from "react";
import {
  ArchiveIcon,
  GitBranchIcon,
  InboxIcon,
  MessageSquareIcon,
  PencilIcon,
  PlusIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, TextInput } from "@/components/ui/input";
import { EmptyState, ErrorState, SkeletonList } from "@/components/ui/states";
import { ApiError } from "@/lib/api/client";
import { archiveSession, createSession, renameSession } from "@/lib/api/endpoints";
import type { Session, SessionVisibility, Workspace } from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

export interface SessionsSidebarProps {
  projectId: string;
  sessions: readonly Session[] | null;
  loading: boolean;
  error: string | null;
  activeSessionId: string | null;
  workspaces: readonly Workspace[];
  onRetry: () => void;
  onSelect: (sessionId: string) => void;
  onRefreshSessions: () => void;
}

export function SessionsSidebar(props: SessionsSidebarProps) {
  const {
    projectId,
    sessions,
    loading,
    error,
    activeSessionId,
    workspaces,
    onRetry,
    onSelect,
    onRefreshSessions,
  } = props;

  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<Session | null>(null);
  const [archiving, setArchiving] = useState<Session | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Sessions
        </h2>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="New session"
          title="New session"
          disabled={workspaces.length === 0}
          onClick={() => setCreateOpen(true)}
        >
          <PlusIcon size={14} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="px-1 pt-1">
            <SkeletonList rows={4} itemHeight="h-11" />
          </div>
        ) : error !== null ? (
          <ErrorState compact message={error} onRetry={onRetry} />
        ) : sessions !== null && sessions.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {sessions.map((session) => (
              <li key={session.id}>
                <div
                  className={`group flex items-center gap-1 rounded-lg pr-1 transition-colors ${
                    session.id === activeSessionId ? "bg-accent-soft" : "hover:bg-muted"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(session.id)}
                    aria-current={session.id === activeSessionId ? "true" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left"
                  >
                    <MessageSquareIcon
                      size={13}
                      className={`shrink-0 ${
                        session.id === activeSessionId ? "text-accent" : "text-faint"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-xs ${
                          session.id === activeSessionId
                            ? "font-medium text-accent"
                            : "text-foreground"
                        }`}
                      >
                        {session.name}
                      </span>
                      <span className="block truncate text-[10px] text-faint">
                        {formatRelativeTime(session.createdAt)} · {session.visibility}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Rename session ${session.name}`}
                    title="Rename"
                    onClick={() => setRenaming(session)}
                    className="rounded p-1 text-faint opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <PencilIcon size={11} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Archive session ${session.name}`}
                    title="Archive session"
                    onClick={() => setArchiving(session)}
                    className="rounded p-1 text-faint opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <ArchiveIcon size={11} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={<InboxIcon size={16} />}
            title="No sessions yet"
            description={
              workspaces.length === 0
                ? "Import a repository first — every session works inside a workspace."
                : "Create a session to start talking to the agent."
            }
          />
        )}
      </div>

      <NewSessionDialog
        open={createOpen}
        projectId={projectId}
        workspaces={[...workspaces]}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setCreateOpen(false);
          onRefreshSessions();
          onSelect(created.id);
        }}
      />
      <RenameSessionDialog
        session={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={onRefreshSessions}
      />
      <ArchiveSessionDialog
        session={archiving}
        onClose={() => setArchiving(null)}
        onArchived={(archivedId) => {
          setArchiving(null);
          onRefreshSessions();
          if (archivedId === activeSessionId) onSelect("");
        }}
      />
    </div>
  );
}

// --- New session -----------------------------------------------------------

function NewSessionDialog({
  open,
  onClose,
  onCreated,
  workspaces,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (session: Session) => void;
  workspaces: readonly Workspace[];
  projectId: string;
}) {
  const usable = workspaces.filter((workspace) => workspace.status !== "destroyed");
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<SessionVisibility>("private");
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Keep the workspace selection valid as the list loads/changes.
  const effectiveWorkspaceId = usable.some((workspace) => workspace.id === workspaceId)
    ? workspaceId
    : (usable[0]?.id ?? "");

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setFieldError("Give the session a name.");
      return;
    }
    if (effectiveWorkspaceId === "") {
      setError("No workspace is available. Import a repository first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createSession(projectId, {
        workspaceId: effectiveWorkspaceId,
        name: trimmed,
        visibility,
      });
      setName("");
      setFieldError(null);
      setSubmitting(false);
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the session.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New session"
      description="A fresh conversation with the agent."
    >
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="new-session-name" error={fieldError}>
            <TextInput
              id="new-session-name"
              value={name}
              maxLength={200}
              placeholder="Implement rate limiting"
              onChange={(event) => setName(event.target.value)}
              invalid={fieldError !== null}
              disabled={submitting}
              required
            />
          </Field>

          <Field label="Visibility" htmlFor="new-session-visibility">
            <select
              id="new-session-visibility"
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value === "shared" ? "shared" : "private")
              }
              disabled={submitting}
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus-visible:border-accent"
            >
              <option value="private">Private</option>
              <option value="shared">Shared</option>
            </select>
          </Field>

          {usable.length > 1 ? (
            <Field label="Workspace" htmlFor="new-session-workspace">
              <select
                id="new-session-workspace"
                value={effectiveWorkspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                disabled={submitting}
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus-visible:border-accent"
              >
                {usable.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.type})
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {usable.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
              <GitBranchIcon size={14} className="shrink-0" />
              This project has no active workspace yet.
            </p>
          ) : null}

          {error !== null ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting} disabled={usable.length === 0}>
              Create Session
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

// --- Rename ------------------------------------------------------------------

function RenameSessionDialog({
  session,
  onClose,
  onRenamed,
}: {
  session: Session | null;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (session === null) return;
    const trimmed = name.trim().length > 0 ? name.trim() : session.name;
    setSubmitting(true);
    try {
      await renameSession(session.id, trimmed);
      setSubmitting(false);
      setError(null);
      onRenamed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not rename the session.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={session !== null}
      onClose={() => {
        if (!submitting) {
          setError(null);
          onClose();
        }
      }}
      title="Rename session"
    >
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <Field label="Name" htmlFor="rename-session-name">
          <TextInput
            id="rename-session-name"
            key={session?.id ?? "none"}
            defaultValue={session?.name ?? ""}
            maxLength={200}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            disabled={submitting}
            required
          />
        </Field>
        {error !== null ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// --- Archive -------------------------------------------------------------------

function ArchiveSessionDialog({
  session,
  onClose,
  onArchived,
}: {
  session: Session | null;
  onClose: () => void;
  onArchived: (sessionId: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function confirm(): Promise<void> {
    if (session === null) return;
    setSubmitting(true);
    try {
      await archiveSession(session.id);
      setSubmitting(false);
      onArchived(session.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not archive the session.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={session !== null}
      onClose={() => {
        if (!submitting) {
          setError(null);
          onClose();
        }
      }}
      title={`Archive “${session?.name ?? ""}”?`}
      description="The conversation is kept but moved out of the active list."
      footer={
        <>
          {error !== null ? (
            <p role="alert" className="mr-auto text-xs text-danger">
              {error}
            </p>
          ) : null}
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="danger" loading={submitting} onClick={() => void confirm()}>
            Archive
          </Button>
        </>
      }
    />
  );
}
