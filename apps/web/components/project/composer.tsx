"use client";

/**
 * Message composer: mode selector (planning / coding / reviewing / testing),
 * model picker sourced from the backend's /v1/models, and the send action.
 * Enter sends; Shift+Enter inserts a newline. Sending is disabled while an
 * agent run is active in this session — one active run per workspace.
 */

import { useEffect, useRef, useState, type CompositionEvent, type KeyboardEvent } from "react";
import { ChevronDownIcon, SendIcon, StopIcon } from "@/components/icons";
import { AGENT_MODES, type AgentMode, type ModelDescriptor } from "@/lib/api/types";

const MAX_CONTENT_LENGTH = 200_000;

const MODE_HINTS: Record<AgentMode, string> = {
  planning: "Explore approaches and draft a plan",
  coding: "Describe what to build, fix, or change",
  reviewing: "Ask for a review of recent changes",
  testing: "Ask for tests to be written or run",
};

export interface ComposerProps {
  disabled: boolean;
  /** True while a streamable run is active: composer swaps send for cancel. */
  agentBusy: boolean;
  /** True while a send request is in flight (disables the send button). */
  sending: boolean;
  onCancelRun: (() => void) | null;
  models: readonly ModelDescriptor[] | null;
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  modelId: string; // "" = automatic
  onModelChange: (modelId: string) => void;
  onSend: (content: string) => void;
  error: string | null;
}

export function Composer({
  disabled,
  agentBusy,
  sending,
  onCancelRun,
  models,
  mode,
  onModeChange,
  modelId,
  onModelChange,
  onSend,
  error,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);

  // Grow the textarea with content up to a cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (el === null) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  function submit(): void {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled || agentBusy || sending) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey && !composingRef.current) {
      event.preventDefault();
      submit();
    }
  }

  function handleCompositionStart(): void {
    composingRef.current = true;
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLTextAreaElement>): void {
    composingRef.current = false;
    // Some IMEs fire composition end before keydown; keep value in sync.
    setValue(event.currentTarget.value);
  }

  const nearLimit = value.length > MAX_CONTENT_LENGTH - 10_000;

  return (
    <div className="border-t border-border bg-background/80 backdrop-blur">
      <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6">
        {error !== null ? (
          <p role="alert" className="mb-2 text-xs text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface p-2 shadow-sm focus-within:border-accent">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            maxLength={MAX_CONTENT_LENGTH}
            placeholder={MODE_HINTS[mode]}
            aria-label="Message OpenLobster"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            disabled={disabled}
            className="max-h-[220px] min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed placeholder:text-faint focus-visible:outline-none disabled:opacity-60"
          />
          {agentBusy && onCancelRun !== null ? (
            <button
              type="button"
              onClick={onCancelRun}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              title="Cancel the running task"
            >
              <StopIcon size={13} />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={disabled || sending || value.trim().length === 0}
              aria-label="Send message"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-40"
            >
              <SendIcon size={15} />
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {/* Mode selector */}
          <div
            role="radiogroup"
            aria-label="Agent mode"
            className="flex overflow-hidden rounded-lg border border-border"
          >
            {AGENT_MODES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                role="radio"
                aria-checked={mode === candidate}
                onClick={() => onModeChange(candidate)}
                className={`px-2.5 py-1 text-[11px] capitalize transition-colors ${
                  mode === candidate
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {candidate}
              </button>
            ))}
          </div>

          {/* Model selector */}
          <label className="relative inline-flex items-center">
            <span className="sr-only">Model</span>
            <select
              value={modelId}
              onChange={(event) => onModelChange(event.target.value)}
              disabled={disabled || models === null}
              className="h-7 appearance-none rounded-lg border border-border bg-surface pl-2.5 pr-7 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:border-accent disabled:opacity-60"
            >
              <option value="">Model: Automatic</option>
              {(models ?? []).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.id} · {model.provider}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              size={11}
              aria-hidden
              className="pointer-events-none absolute right-2 text-faint"
            />
          </label>

          <span className="ml-auto hidden text-[11px] text-faint sm:block">
            Enter to send · Shift+Enter for new line
          </span>
          {nearLimit ? (
            <span className={`text-[11px] ${nearLimit ? "text-warning" : "text-faint"}`}>
              {MAX_CONTENT_LENGTH - value.length} characters left
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
