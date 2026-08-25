"use client";

/**
 * Scrollable transcript for the selected session with auto-scroll behavior:
 * follows new content while pinned to bottom, stops following when the user
 * scrolls up, and offers a jump-to-latest affordance.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, LoaderIcon } from "@/components/icons";
import { MessageItem } from "./message-item";
import type { ChatMessage } from "@/lib/api/types";

export function ChatPanel({
  messages,
  loading,
  error,
  onRetry,
  agentActive,
}: {
  messages: readonly ChatMessage[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  agentActive: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const lastCountRef = useRef(0);

  // Follow the stream only while the user is already at the bottom.
  useEffect(() => {
    const container = scrollRef.current;
    if (container === null) return;
    const grew = messages.length !== lastCountRef.current;
    lastCountRef.current = messages.length;
    if (grew && pinnedToBottom) {
      container.scrollTo({ top: container.scrollHeight });
    }
  }, [messages, pinnedToBottom]);

  function handleScroll(): void {
    const container = scrollRef.current;
    if (container === null) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    setPinnedToBottom(distance < 48);
  }

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground" role="status">
        <LoaderIcon size={18} className="animate-spin" />
      </div>
    );
  }

  if (error !== null && messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Could not load this conversation.</p>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-accent hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto"
        aria-live="polite"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
          {messages.length === 0 ? (
            <WelcomeHint />
          ) : (
            messages.map((message) => <MessageItem key={message.id} message={message} />)
          )}
          {agentActive ? <AgentWorkingIndicator /> : null}
          <div className="h-2" />
        </div>
      </div>

      {!pinnedToBottom ? (
        <button
          type="button"
          onClick={() => {
            const container = scrollRef.current;
            if (container === null) return;
            container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
            setPinnedToBottom(true);
          }}
          aria-label="Jump to latest message"
          className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-elevated p-2 text-muted-foreground shadow-lg transition-colors hover:text-foreground"
        >
          <ChevronDownIcon size={15} />
        </button>
      ) : null}
    </div>
  );
}

function WelcomeHint() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <p className="text-lg font-semibold tracking-tight">Start the conversation</p>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        Describe what you want built, fixed, or changed. The agent will explore the repository,
        propose a plan, and implement it step by step.
      </p>
    </div>
  );
}

function AgentWorkingIndicator() {
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted-foreground" role="status">
      <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
        <span aria-hidden className="size-1.5 animate-pulse-dot rounded-full bg-accent" />
      </span>
      OpenLobster is working
    </div>
  );
}
