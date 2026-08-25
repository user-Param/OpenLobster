"use client";

/**
 * Orchestrator for the main chat workspace of a project. Owns:
 *   - project / workspace / session / model data
 *   - message history (cursor-paginated) and optimistic sending
 *   - the single active agent run per session (detection + SSE timeline)
 *   - run controls (cancel / pause / resume) and the resulting diff
 *
 * Layout: sessions sidebar (drawer on mobile), chat column, activity panel
 * (slide-over below xl).
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIcon,
  ArrowLeftIcon,
  GitBranchIcon,
  LoaderIcon,
  MessageSquareIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ApiError } from "@/lib/api/client";
import {
  cancelRun,
  createSession,
  fetchModels,
  fetchRun,
  fetchRunDiff,
  getSession,
  getProject,
  listMessages,
  listSessions,
  listWorkspaces,
  pauseRun,
  resumeRun,
  sendMessage,
} from "@/lib/api/endpoints";
import type {
  AgentMode,
  ChatMessage,
  Project,
  RunDiff,
  RunStatus,
  Session,
  Workspace,
} from "@/lib/api/types";
import { useApiQuery } from "@/lib/hooks/use-api-query";
import { isStreamableStatus, useRunStream } from "@/lib/hooks/use-run-stream";
import { formatRelativeTime } from "@/lib/format";
import { ActivityPanel, type ActiveRunUiStatus } from "./activity-panel";
import { ChatPanel } from "./chat-panel";
import { Composer } from "./composer";
import { ImportWorkspaceDialog } from "./import-workspace-dialog";
import { SessionsSidebar } from "./sessions-sidebar";

const TERMINAL_RUN_STATUSES: readonly string[] = ["completed", "failed", "cancelled", "timeout"];
const MESSAGE_PAGE_LIMIT = 200;
const MAX_MESSAGE_PAGES = 8;

interface ActiveRun {
  runId: string;
  status: ActiveRunUiStatus;
}

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  // --- Core data -----------------------------------------------------------
  const projectQuery = useApiQuery<Project>(() => getProject(projectId), [projectId]);
  const workspaceQuery = useApiQuery<Workspace[]>(
    () => listWorkspaces(projectId).then((result) => result.workspaces),
    [projectId],
  );
  const sessionsQuery = useApiQuery<Session[]>(
    () => listSessions(projectId).then((result) => result.sessions),
    [projectId],
  );
  const modelsQuery = useApiQuery(() => fetchModels().then((result) => result.models), []);

  const workspaces = useMemo(
    () => (workspaceQuery.data ?? []).filter((workspace) => workspace.status !== "destroyed"),
    [workspaceQuery.data],
  );
  const sessions = sessionsQuery.data;

  // --- Session selection (derived fallback: latest session) -----------------
  // `selectedSessionId` is null (auto), "" (explicitly none), or an id.
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const sessionId: string | null =
    selectedSessionId === null
      ? (sessions?.[0]?.id ?? null)
      : selectedSessionId === ""
        ? null
        : selectedSessionId;

  function selectSession(id: string): void {
    setSelectedSessionId(id);
  }

  const sessionQuery = useApiQuery<Session | null>(
    async () => {
      if (sessionId === null) return null;
      try {
        return await getSession(sessionId);
      } catch (error) {
        // Archived/missing session: drop the selection rather than blocking UI.
        if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
          return null;
        }
        throw error;
      }
    },
    [sessionId],
  );

  const activeSession: Session | null =
    sessions?.find((entry) => entry.id === sessionId) ?? sessionQuery.data ?? null;

  // --- Diff ------------------------------------------------------------------
  const [diff, setDiff] = useState<RunDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const diffRunIdRef = useRef<string | null>(null);

  const refreshDiff = useCallback(async (runId: string): Promise<void> => {
    diffRunIdRef.current = runId;
    setDiff(null);
    setDiffLoading(true);
    setDiffError(null);
    try {
      const result = await fetchRunDiff(runId);
      if (diffRunIdRef.current === runId) setDiff(result);
    } catch (error) {
      if (diffRunIdRef.current === runId) {
        setDiffError(error instanceof ApiError ? error.message : "Could not load changes.");
      }
    } finally {
      if (diffRunIdRef.current === runId) setDiffLoading(false);
    }
  }, []);

  // --- Active run ---------------------------------------------------------------
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [lastFinished, setLastFinished] = useState<{ runId: string; status: string } | null>(null);
  const [usage, setUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  } | null>(null);
  const [controlBusy, setControlBusy] = useState<false | "cancel" | "pause" | "resume">(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  /**
   * Server-authoritative resume: if the newest user message has a run that
   * never produced a reply, ask the backend whether it is still live.
   */
  async function detectActiveRun(loaded: readonly ChatMessage[]): Promise<void> {
    for (let index = loaded.length - 1; index >= 0; index -= 1) {
      const message = loaded[index];
      if (message === undefined || message.role !== "user" || message.runId === null) continue;
      const answered = loaded.some(
        (candidate) => candidate.runId === message.runId && candidate.role !== "user",
      );
      if (!answered) {
        try {
          const detail = await fetchRun(message.runId);
          if (TERMINAL_RUN_STATUSES.includes(detail.status)) {
            setLastFinished({ runId: detail.id, status: detail.status });
            setUsage(detail.usage);
            if (detail.status === "completed") void refreshDiff(detail.id);
          } else {
            setActiveRun({ runId: detail.id, status: detail.status });
          }
        } catch {
          // Run lookup failed; leave the UI idle rather than guessing.
        }
      }
      return;
    }
  }

  // --- Messages ---------------------------------------------------------------
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const messagesRequestRef = useRef(0);

  const loadMessages = useCallback(
    async (targetSessionId: string): Promise<void> => {
      // A fresh transcript starts from a clean slate (run state included).
      messagesRequestRef.current += 1;
      const requestId = messagesRequestRef.current;
      const controller = new AbortController();
      setMessages([]);
      setMessagesError(null);
      setActiveRun(null);
      setLastFinished(null);
      setUsage(null);
      setDiff(null);
      setDiffError(null);
      setSendError(null);
      setMessagesLoading(true);
      try {
        // Forward pagination from the oldest message until caught up.
        const collected: ChatMessage[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < MAX_MESSAGE_PAGES; page += 1) {
          const response = await listMessages(targetSessionId, {
            cursor,
            limit: MESSAGE_PAGE_LIMIT,
            signal: controller.signal,
          });
          collected.push(...response.messages);
          if (response.nextCursor === null) break;
          cursor = response.nextCursor;
        }
        if (requestId !== messagesRequestRef.current) return;
        setMessages(collected);
        await detectActiveRun(collected);
      } catch (error) {
        if (requestId !== messagesRequestRef.current) return;
        if (error instanceof ApiError && error.code === "cancelled") return;
        setMessagesError(
          error instanceof ApiError ? error.message : "Could not load the conversation.",
        );
      } finally {
        if (requestId === messagesRequestRef.current) setMessagesLoading(false);
      }
    },
    // refreshDiff identity is stable; it is intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleTerminalEvent = useCallback(
    (runId: string, status: RunStatus) => {
      // Keep the entry mounted (with its timeline) but flip it to terminal;
      // the SSE subscription stops itself for terminal statuses.
      setActiveRun((current) => (current?.runId === runId ? { ...current, status } : current));
      setLastFinished({ runId, status });
      void (async () => {
        try {
          const detail = await fetchRun(runId);
          setUsage(detail.usage);
        } catch {
          setUsage(null);
        }
        if (status === "completed") void refreshDiff(runId);
      })();
      // The assistant reply is persisted by the worker — reload the transcript.
      if (sessionId !== null) void loadMessages(sessionId);
    },
    [sessionId, loadMessages, refreshDiff],
  );

  const stream = useRunStream({
    runId: activeRun?.runId ?? null,
    status: activeRun?.status,
    onTerminal: handleTerminalEvent,
  });

  // Reload the transcript whenever the selection changes. The load is
  // deferred to a microtask so state resets never run during the effect
  // flush; cleanup invalidates any in-flight history request.
  useEffect(() => {
    if (sessionId === null) return undefined;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return loadMessages(sessionId);
    });
    return () => {
      active = false;
      messagesRequestRef.current += 1;
    };
  }, [sessionId, loadMessages]);

  // --- Sending --------------------------------------------------------------------
  const [mode, setMode] = useState<AgentMode>("coding");
  const [modelId, setModelId] = useState("");

  async function handleSend(content: string): Promise<void> {
    if (sessionId === null || activeRun !== null || sending) return;
    const tempId = `pending-${crypto.randomUUID()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      role: "user",
      content,
      runId: null,
      createdAt: new Date().toISOString(),
    };
    // Optimistic bubble; replaced with the persisted id on 202, removed on error.
    setMessages((previous) => [...previous, optimistic]);
    setSendError(null);
    setSending(true);
    try {
      const result = await sendMessage(sessionId, {
        content,
        mode,
        ...(modelId.length > 0 ? { model: modelId } : {}),
        idempotencyKey: crypto.randomUUID(),
      });
      setMessages((previous) =>
        previous.map((message) =>
          message.id === tempId
            ? { ...message, id: result.messageId, runId: result.runId }
            : message,
        ),
      );
      setActiveRun({ runId: result.runId, status: "queued" });
    } catch (error) {
      setMessages((previous) => previous.filter((message) => message.id !== tempId));
      setSendError(error instanceof ApiError ? error.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
  }

  // --- Run controls ---------------------------------------------------------------
  async function controlRun(action: "cancel" | "pause" | "resume"): Promise<void> {
    if (activeRun === null) return;
    const current = activeRun;
    const optimistic: ActiveRunUiStatus =
      action === "cancel" ? "cancelling" : action === "pause" ? "pausing" : "resuming";
    setControlBusy(action);
    setActionError(null);
    setActiveRun({ ...current, status: optimistic });
    try {
      if (action === "cancel") await cancelRun(current.runId);
      else if (action === "pause") await pauseRun(current.runId);
      else await resumeRun(current.runId);
      // Authoritative transitions arrive via run.* SSE events.
    } catch (error) {
      setActiveRun(current);
      setActionError(error instanceof ApiError ? error.message : `Could not ${action} the run.`);
    } finally {
      setControlBusy(false);
    }
  }

  function handleRefreshDiff(): void {
    if (lastFinished !== null) void refreshDiff(lastFinished.runId);
  }

  // --- Workspace import -----------------------------------------------------------------
  const [importOpen, setImportOpen] = useState(false);

  async function handleWorkspaceImported(workspace: Workspace): Promise<void> {
    setImportOpen(false);
    workspaceQuery.refetch();
    // Smooth onboarding: open a first session inside the imported workspace.
    try {
      const created = await createSession(projectId, {
        workspaceId: workspace.id,
        name: "New session",
        visibility: "private",
      });
      sessionsQuery.refetch();
      selectSession(created.id);
    } catch {
      // Session creation is best-effort; the sidebar offers creation retry.
    }
  }

  // --- Mobile drawers -----------------------------------------------------------------------
  const [mobilePanel, setMobilePanel] = useState<"none" | "sessions" | "activity">("none");

  useEffect(() => {
    if (mobilePanel === "none") return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setMobilePanel("none");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobilePanel]);

  // --- Render -----------------------------------------------------------------------------------
  if (projectQuery.isLoading) {
    return (
      <Centered>
        <LoaderIcon size={18} className="animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  if (projectQuery.error !== null || projectQuery.data === null) {
    return (
      <Centered>
        <ErrorState
          title="Could not open this project"
          message={
            projectQuery.error?.status === 404
              ? "This project does not exist or was deleted."
              : (projectQuery.error?.message ?? "Something went wrong.")
          }
          onRetry={projectQuery.refetch}
        />
      </Centered>
    );
  }

  const project = projectQuery.data;
  const agentBusy = activeRun !== null;

  const sidebar = (
    <SessionsSidebar
      projectId={projectId}
      sessions={sessions ?? null}
      loading={sessionsQuery.isLoading}
      error={sessionsQuery.error?.message ?? null}
      activeSessionId={sessionId}
      workspaces={workspaces}
      onRetry={sessionsQuery.refetch}
      onSelect={(id) => {
        selectSession(id);
        setMobilePanel("none");
      }}
      onRefreshSessions={sessionsQuery.refetch}
    />
  );

  const panel = (
    <ActivityPanel
      events={stream.events}
      connection={stream.connection}
      activeRun={activeRun}
      lastFinished={lastFinished}
      usage={usage}
      onCancel={() => void controlRun("cancel")}
      onPause={() => void controlRun("pause")}
      onResume={() => void controlRun("resume")}
      controlBusy={controlBusy}
      actionError={actionError}
      diff={diff}
      diffLoading={diffLoading}
      diffError={diffError}
      onRefreshDiff={handleRefreshDiff}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col md:h-dvh">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
        <Link
          href="/workspace"
          aria-label="Back to projects"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeftIcon size={15} />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-xs text-faint">{project.name}</p>
          <h1 className="truncate text-sm font-medium leading-tight">
            {activeSession?.name ?? "No session selected"}
          </h1>
        </div>
        {activeSession !== null ? (
          <Badge className="ml-2 hidden sm:inline-flex">{activeSession.visibility}</Badge>
        ) : null}
        <span className="ml-auto hidden text-xs text-faint lg:block">
          {activeSession !== null ? `Started ${formatRelativeTime(activeSession.createdAt)}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="lg:hidden"
            onClick={() => setMobilePanel("sessions")}
          >
            <MessageSquareIcon size={13} />
            Sessions
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="xl:hidden"
            onClick={() => setMobilePanel("activity")}
          >
            <ActivityIcon size={13} />
            Activity
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Sessions sidebar (persistent on lg+) */}
        <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
          {sidebar}
        </aside>

        {/* Chat column */}
        <section className="flex min-w-0 flex-1 flex-col bg-background">
          {workspaces.length === 0 ? (
            <OnboardingImport onImport={() => setImportOpen(true)} />
          ) : sessionId === null ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={<MessageSquareIcon size={18} />}
                title="Select or create a session"
                description="Pick a conversation from the sidebar, or start a new one to begin working with the agent."
              />
            </div>
          ) : (
            <>
              <ChatPanel
                messages={messages}
                loading={messagesLoading}
                error={messagesError}
                onRetry={() => void loadMessages(sessionId)}
                agentActive={agentBusy && isStreamableStatus(activeRun?.status ?? "")}
              />
              <Composer
                disabled={(activeSession?.status ?? "active") !== "active"}
                agentBusy={agentBusy && isStreamableStatus(activeRun?.status ?? "")}
                sending={sending}
                onCancelRun={
                  activeRun !== null && isStreamableStatus(activeRun.status)
                    ? () => void controlRun("cancel")
                    : null
                }
                models={modelsQuery.data ?? null}
                mode={mode}
                onModeChange={setMode}
                modelId={modelId}
                onModelChange={setModelId}
                onSend={(content) => void handleSend(content)}
                error={sendError}
              />
            </>
          )}
        </section>

        {/* Activity panel (persistent on xl+) */}
        <aside className="hidden w-80 shrink-0 border-l border-border xl:block">{panel}</aside>
      </div>

      {/* Mobile drawers */}
      {mobilePanel !== "none" ? (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-overlay animate-fade-in"
            onClick={() => setMobilePanel("none")}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={mobilePanel === "sessions" ? "Sessions" : "Agent activity"}
            className={`absolute inset-y-0 w-[min(20rem,85vw)] overflow-hidden pt-12 ${
              mobilePanel === "sessions" ? "left-0 border-r" : "right-0 border-l"
            } border-border bg-surface shadow-2xl`}
          >
            {mobilePanel === "sessions" ? sidebar : panel}
          </div>
        </div>
      ) : null}

      <ImportWorkspaceDialog
        open={importOpen}
        projectId={projectId}
        onClose={() => setImportOpen(false)}
        onImported={(workspace) => void handleWorkspaceImported(workspace)}
      />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center py-24">{children}</div>;
}

function OnboardingImport({ onImport }: { onImport: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
        <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <GitBranchIcon size={18} />
        </span>
        <h2 className="text-base font-semibold">Connect a repository</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Sessions run against a workspace. Import a repository to give the agent somewhere to
          work.
        </p>
        <Button className="mt-5" onClick={onImport}>
          Import Repository
        </Button>
      </div>
    </div>
  );
}
