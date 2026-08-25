"use client";

/**
 * Right-hand agent activity panel: live run status with controls, the
 * event timeline derived from the backend SSE stream, and the per-run file
 * diff. On narrow viewports it renders inside a slide-over (handled by the
 * parent), so it is purely presentational.
 */

import { useState } from "react";
import {
  ActivityIcon,
  ChevronRightIcon,
  ClockIcon,
  FileDiffIcon,
  GitBranchIcon,
  LoaderIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  StopIcon,
  XIcon,
} from "@/components/icons";
import { Badge, StatusDot, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { formatRelativeTime, formatRunStatus, formatTokenCount, formatUsd } from "@/lib/format";
import type {
  AgentEventEnvelope,
  RunDiff,
  RunStatus,
} from "@/lib/api/types";

export type ActiveRunUiStatus = RunStatus | "cancelling" | "pausing" | "resuming";

const TERMINAL_STATUSES: readonly string[] = ["completed", "failed", "cancelled", "timeout"];

export interface ActivityPanelProps {
  events: readonly AgentEventEnvelope[];
  connection: "connecting" | "live" | "reconnecting" | "stopped" | null;
  activeRun: { runId: string; status: ActiveRunUiStatus } | null;
  lastFinished: { runId: string; status: string } | null;
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number } | null;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
  controlBusy: false | "cancel" | "pause" | "resume";
  actionError: string | null;
  diff: RunDiff | null;
  diffLoading: boolean;
  diffError: string | null;
  onRefreshDiff: () => void;
}

export function ActivityPanel(props: ActivityPanelProps) {
  const {
    events,
    connection,
    activeRun,
    lastFinished,
    usage,
    onCancel,
    onPause,
    onResume,
    controlBusy,
    actionError,
    diff,
    diffLoading,
    diffError,
    onRefreshDiff,
  } = props;

  const currentStatus = activeRun?.status ?? lastFinished?.status ?? null;

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* --- Header + status ---------------------------------------------- */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <ActivityIcon size={13} />
            Agent Activity
          </h2>
          <ConnectionBadge state={connection} />
        </div>

        {currentStatus !== null ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(currentStatus)}>
              <StatusDot tone={statusTone(currentStatus)} />
              {formatRunStatus(currentStatus)}
            </Badge>
            {usage !== null && usage.inputTokens + usage.outputTokens > 0 ? (
              <span className="text-[11px] text-faint">
                {formatTokenCount(usage.inputTokens + usage.outputTokens)} tokens ·{" "}
                {formatUsd(usage.estimatedCostUsd)}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Controls */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {activeRun !== null && !TERMINAL_STATUSES.includes(activeRun.status) ? (
            <>
              {["running", "waiting_tool", "waiting_approval", "starting"].includes(
                activeRun.status,
              ) ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onPause}
                    loading={controlBusy === "pause"}
                  >
                    <PauseIcon size={12} />
                    Pause
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onCancel}
                    loading={controlBusy === "cancel"}
                  >
                    <StopIcon size={12} />
                    Cancel
                  </Button>
                </>
              ) : activeRun.status === "paused" ? (
                <>
                  <Button size="sm" onClick={onResume} loading={controlBusy === "resume"}>
                    <PlayIcon size={12} />
                    Resume
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onCancel}
                    loading={controlBusy === "cancel"}
                  >
                    <XIcon size={12} />
                    Cancel
                  </Button>
                </>
              ) : (
                // queued / cancelling / pausing / resuming: only cancel makes sense.
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onCancel}
                  disabled={activeRun.status !== "queued"}
                  loading={controlBusy === "cancel"}
                >
                  <StopIcon size={12} />
                  Cancel
                </Button>
              )}
            </>
          ) : null}
          {(activeRun === null || TERMINAL_STATUSES.includes(activeRun.status)) &&
          lastFinished !== null ? (
            <span className="text-[11px] text-faint">
              Last run {formatRunStatus(lastFinished.status)}
            </span>
          ) : null}
        </div>

        {actionError !== null ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {actionError}
          </p>
        ) : null}
      </div>

      {/* --- Timeline ------------------------------------------------------ */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        {events.length === 0 ? (
          <EmptyState
            compact
            icon={<ClockIcon size={16} />}
            title="No activity yet"
            description="Agent steps, tool calls, and test results will appear here during a run."
          />
        ) : (
          <ol className="relative flex flex-col gap-0 border-l border-border pl-4">
            {events.map((event) => (
              <TimelineEntry key={`${event.sequence}-${event.id}`} event={event} />
            ))}
          </ol>
        )}
      </div>

      {/* --- Diff ------------------------------------------------------------ */}
      <DiffSection
        diff={diff}
        loading={diffLoading}
        error={diffError}
        hasFinishedRun={lastFinished !== null}
        onRefresh={onRefreshDiff}
      />
    </div>
  );
}

// --- Timeline -----------------------------------------------------------------

function TimelineEntry({ event }: { event: AgentEventEnvelope }) {
  const meta = describeEvent(event);
  return (
    <li className={`relative pb-3 ${meta.animateLast ? "animate-fade-up" : ""}`}>
      <span
        aria-hidden
        className={`absolute -left-[21px] top-1 flex size-3 items-center justify-center rounded-full border ${meta.dotClass}`}
      >
        <span className={`size-1 rounded-full ${meta.dotInnerClass}`} />
      </span>
      <p className="text-xs leading-relaxed text-foreground">{meta.label}</p>
      {meta.detail !== undefined ? (
        <p className="mt-0.5 break-all font-mono text-[11px] leading-snug text-muted-foreground">
          {meta.detail}
        </p>
      ) : null}
      <p className="mt-0.5 text-[10px] text-faint">{formatRelativeTime(event.createdAt)}</p>
    </li>
  );
}

interface EventMeta {
  label: string;
  detail?: string;
  dotClass: string;
  dotInnerClass: string;
  animateLast?: boolean;
}

function payloadString(event: AgentEventEnvelope, key: string): string | undefined {
  const value = event.payload[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function describeEvent(event: AgentEventEnvelope): EventMeta {
  switch (event.type) {
    case "run.started":
      return {
        label: "Run started",
        detail: payloadString(event, "attempt") !== undefined ? `Attempt ${payloadString(event, "attempt")}` : undefined,
        dotClass: "border-accent/60 bg-accent-soft",
        dotInnerClass: "bg-accent",
        animateLast: true,
      };
    case "run.completed":
      return {
        label: "Run completed",
        detail:
          payloadString(event, "outputTokens") !== undefined
            ? `${formatTokenCount(Number(payloadString(event, "outputTokens")))} output tokens`
            : undefined,
        dotClass: "border-success/50 bg-success/10",
        dotInnerClass: "bg-success",
      };
    case "run.failed":
      return {
        label: "Run failed",
        detail:
          payloadString(event, "reason") ?? payloadString(event, "error") ?? undefined,
        dotClass: "border-danger/50 bg-danger/10",
        dotInnerClass: "bg-danger",
      };
    case "run.cancelled":
      return { label: "Run cancelled", dotClass: "border-border bg-muted", dotInnerClass: "bg-muted-foreground" };
    case "run.paused":
      return { label: "Paused at a safe boundary", dotClass: "border-warning/50 bg-warning/10", dotInnerClass: "bg-warning" };
    case "run.resumed":
      return { label: "Resumed from checkpoint", dotClass: "border-accent/60 bg-accent-soft", dotInnerClass: "bg-accent" };
    case "context.retrieval.started":
      return { label: "Reading project context", dotClass: "border-border bg-muted", dotInnerClass: "bg-muted-foreground" };
    case "context.retrieval.completed":
      return { label: "Context ready", dotClass: "border-border bg-muted", dotInnerClass: "bg-muted-foreground" };
    case "llm.started": {
      const iteration = payloadString(event, "iteration");
      return {
        label: iteration !== undefined ? `Reasoning · step ${iteration}` : "Reasoning",
        dotClass: "border-accent/60 bg-accent-soft",
        dotInnerClass: "bg-accent",
        animateLast: true,
      };
    }
    case "llm.completed":
      return { label: "Response received", dotClass: "border-border bg-muted", dotInnerClass: "bg-muted-foreground" };
    case "tool.requested":
      return {
        label: `Requested ${payloadString(event, "toolName") ?? "tool"}`,
        dotClass: "border-border bg-muted",
        dotInnerClass: "bg-muted-foreground",
      };
    case "tool.started":
      return {
        label: `Running ${payloadString(event, "toolName") ?? "tool"}`,
        detail: payloadString(event, "callId"),
        dotClass: "border-accent/60 bg-accent-soft",
        dotInnerClass: "bg-accent",
        animateLast: true,
      };
    case "tool.completed": {
      const ok = event.payload["ok"];
      const success = ok === true || ok === "true" || ok === undefined;
      return {
        label: `${payloadString(event, "toolName") ?? "Tool"} ${success ? "completed" : "failed"}`,
        dotClass: success ? "border-success/50 bg-success/10" : "border-danger/50 bg-danger/10",
        dotInnerClass: success ? "bg-success" : "bg-danger",
      };
    }
    case "file.created":
    case "file.modified":
    case "file.deleted": {
      const path =
        payloadString(event, "path") ?? payloadString(event, "filePath") ?? undefined;
      return {
        label:
          event.type === "file.created"
            ? "Created file"
            : event.type === "file.modified"
              ? "Modified file"
              : "Deleted file",
        detail: path,
        dotClass: "border-accent/60 bg-accent-soft",
        dotInnerClass: "bg-accent",
      };
    }
    case "command.started":
      return {
        label: "Running command",
        detail: payloadString(event, "command") ?? payloadString(event, "cmd"),
        dotClass: "border-accent/60 bg-accent-soft",
        dotInnerClass: "bg-accent",
        animateLast: true,
      };
    case "command.completed": {
      const exit = payloadString(event, "exitCode");
      const failed = exit !== undefined && exit !== "0";
      return {
        label: failed ? "Command failed" : "Command finished",
        detail: exit !== undefined ? `Exit ${exit}` : undefined,
        dotClass: failed ? "border-danger/50 bg-danger/10" : "border-success/50 bg-success/10",
        dotInnerClass: failed ? "bg-danger" : "bg-success",
      };
    }
    case "test.started":
      return { label: "Running tests", dotClass: "border-accent/60 bg-accent-soft", dotInnerClass: "bg-accent", animateLast: true };
    case "test.passed":
      return { label: "Tests passed", detail: payloadString(event, "summary"), dotClass: "border-success/50 bg-success/10", dotInnerClass: "bg-success" };
    case "test.failed":
      return { label: "Tests failed", detail: payloadString(event, "summary"), dotClass: "border-danger/50 bg-danger/10", dotInnerClass: "bg-danger" };
    case "approval.requested":
      return {
        label: "Approval required",
        detail:
          payloadString(event, "reason") ??
          (event.payload["toolName"] !== undefined ? String(event.payload["toolName"]) : undefined),
        dotClass: "border-warning/50 bg-warning/10",
        dotInnerClass: "bg-warning",
        animateLast: true,
      };
    case "approval.granted":
      return { label: "Approval granted", dotClass: "border-success/50 bg-success/10", dotInnerClass: "bg-success" };
    case "approval.denied":
      return { label: "Approval denied", dotClass: "border-danger/50 bg-danger/10", dotInnerClass: "bg-danger" };
    default:
      return { label: event.type, dotClass: "border-border bg-muted", dotInnerClass: "bg-muted-foreground" };
  }
}

function ConnectionBadge({ state }: { state: ActivityPanelProps["connection"] }) {
  if (state === null) return null;
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    connecting: { tone: "warning", label: "Connecting" },
    live: { tone: "success", label: "Live" },
    reconnecting: { tone: "warning", label: "Reconnecting" },
    stopped: { tone: "neutral", label: "Offline" },
  };
  const entry = map[state] ?? { tone: "neutral" as BadgeTone, label: state };
  return (
    <Badge tone={entry.tone}>
      <StatusDot tone={entry.tone} />
      {entry.label}
    </Badge>
  );
}

function statusTone(status: string): BadgeTone {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
    case "timeout":
      return "danger";
    case "cancelled":
      return "neutral";
    case "paused":
    case "pausing":
    case "waiting_approval":
      return "warning";
    default:
      return "brand";
  }
}

// --- Diff ----------------------------------------------------------------------

function DiffSection({
  diff,
  loading,
  error,
  hasFinishedRun,
  onRefresh,
}: {
  diff: RunDiff | null;
  loading: boolean;
  error: string | null;
  hasFinishedRun: boolean;
  onRefresh: () => void;
}) {
  const [openFile, setOpenFile] = useState<string | null>(null);

  if (!hasFinishedRun && diff === null) return null;

  return (
    <div className="border-t border-border">
      <div className="flex items-center justify-between px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <FileDiffIcon size={13} />
          Changes
          {diff !== null ? (
            <span className="font-mono text-[10px] normal-case tracking-normal">
              <span className="text-success">+{diff.totals.additions}</span>{" "}
              <span className="text-danger">-{diff.totals.deletions}</span>
            </span>
          ) : null}
        </h3>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh diff"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshIcon size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error !== null ? (
        <p role="alert" className="px-4 pb-3 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {loading && diff === null ? (
        <div className="flex items-center gap-2 px-4 pb-4 text-xs text-muted-foreground" role="status">
          <LoaderIcon size={12} className="animate-spin" /> Loading changes
        </div>
      ) : null}
      {diff !== null && diff.files.length === 0 ? (
        <p className="px-4 pb-4 text-xs text-muted-foreground">This run did not change any files.</p>
      ) : null}
      {diff !== null && diff.files.length > 0 ? (
        <ul className="max-h-72 overflow-y-auto px-2 pb-3">
          {diff.files.map((file) => {
            const open = openFile === file.path;
            return (
              <li key={file.path}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenFile(open ? null : file.path)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted"
                >
                  <ChevronRightIcon
                    size={12}
                    className={`shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`}
                  />
                  <GitBranchIcon size={12} className="shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{file.path}</span>
                  <span className="shrink-0 font-mono text-[10px]">
                    <span className="text-success">+{file.additions}</span>{" "}
                    <span className="text-danger">-{file.deletions}</span>
                  </span>
                </button>
                {open ? <UnifiedDiff diffText={file.diff} /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** Renders one unified diff body with add/remove highlighting (read-only). */
export function UnifiedDiff({ diffText }: { diffText: string }) {
  const lines = diffText.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return (
    <div className="mx-2 mb-2 overflow-x-auto rounded-lg border border-border bg-background font-mono text-[11px] leading-5">
      <pre className="w-max min-w-full p-2">
        {lines.map((line, index) => {
          let cls = "text-muted-foreground";
          if (line.startsWith("+") && !line.startsWith("+++")) cls = "text-success bg-success/5";
          else if (line.startsWith("-") && !line.startsWith("---")) cls = "text-danger bg-danger/5";
          else if (line.startsWith("@@")) cls = "text-accent";
          else if (line.startsWith("diff ") || line.startsWith("index ")) cls = "text-faint";
          return (
            <div key={index} className={`whitespace-pre px-2 ${cls}`}>
              {line.length === 0 ? " " : line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
