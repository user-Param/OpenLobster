"use client";

/**
 * Subscribes to one agent run's SSE event stream for as long as the run is
 * non-terminal. Replays durable history from the backend on connect, keeps
 * events deduplicated by sequence number, and reports the derived run
 * status. All resources are released when the run id changes or unmounts.
 *
 * All state updates occur inside stream callbacks (never synchronously in
 * the effect body); the view for an unstarted run is derived, not stored.
 */

import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/auth/token-store";
import { runEventsPath } from "@/lib/api/endpoints";
import { subscribeRunEvents, type SseConnectionState } from "@/lib/sse/run-events";
import type { AgentEventEnvelope, RunStatus } from "@/lib/api/types";

const TERMINAL_EVENT_STATUS: Readonly<Record<string, RunStatus>> = {
  "run.completed": "completed",
  "run.failed": "failed",
  "run.cancelled": "cancelled",
};

/** Statuses for which an open stream is meaningful. */
export function isStreamableStatus(status: string): boolean {
  return !["completed", "failed", "cancelled", "timeout"].includes(status);
}

export interface RunStream {
  readonly events: readonly AgentEventEnvelope[];
  readonly connection: SseConnectionState | null;
}

const EMPTY_STREAM: RunStream = { events: [], connection: null };

interface StreamState {
  /** Run id the stored stream belongs to. */
  readonly runId: string;
  readonly events: readonly AgentEventEnvelope[];
  readonly connection: SseConnectionState | null;
}

export function useRunStream(options: {
  runId: string | null;
  /** Latest known status; streaming stops for terminal statuses. */
  status?: string;
  onTerminal?: (runId: string, status: RunStatus) => void;
}): RunStream {
  const { runId, status } = options;
  const [state, setState] = useState<StreamState>({
    runId: "",
    events: [],
    connection: null,
  });

  // Callbacks are synced through effects so identity changes never resubscribe.
  const onTerminalRef = useRef(options.onTerminal);
  useEffect(() => {
    onTerminalRef.current = options.onTerminal;
  }, [options.onTerminal]);

  const shouldStream = runId !== null && (status === undefined || isStreamableStatus(status));

  useEffect(() => {
    if (runId === null || !shouldStream) return;

    let active = true;
    let sawTerminal = false;
    const controller = new AbortController();

    void subscribeRunEvents({
      path: runEventsPath(runId),
      getAccessToken,
      lastEventId: -1,
      signal: controller.signal,
      onEvent: (envelope) => {
        if (!active) return;
        setState((previous) => {
          if (previous.runId !== runId) {
            return { runId, events: [envelope], connection: previous.connection };
          }
          const last = previous.events[previous.events.length - 1];
          if (last !== undefined && envelope.sequence <= last.sequence) return previous;
          return { ...previous, events: [...previous.events, envelope] };
        });

        const terminal = TERMINAL_EVENT_STATUS[envelope.type];
        if (terminal !== undefined && !sawTerminal) {
          sawTerminal = true;
          onTerminalRef.current?.(runId, terminal);
        }
      },
      onStateChange: (connection) => {
        if (!active) return;
        setState((previous) => ({ ...previous, runId, connection }));
      },
      shouldContinue: () => active && !sawTerminal,
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [runId, shouldStream]);

  // Derived view: a run we have not received anything for renders empty.
  return state.runId === runId && runId !== null
    ? { events: state.events, connection: state.connection }
    : EMPTY_STREAM;
}
