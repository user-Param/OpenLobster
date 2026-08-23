/**
 * Agent event envelopes. Per CLAUDE.md §19 (Events) + §16 (event ordering).
 *
 * Every run event gets a per-run monotonically increasing sequence number so
 * SSE clients can detect gaps/out-of-order delivery via Last-Event-ID.
 *
 * Payload shapes are intentionally open (Record<string, unknown>) — the
 * validation package guards the envelope; payload contents are owned by the
 * emitter. This keeps adding new agent lifecycle moments migration-free.
 */

import type { AgentEventType } from "@openlobster/types";

export interface AgentEventEnvelope {
  /** UUID of the persisted row. */
  readonly id: string;
  readonly runId: string;
  readonly sessionId: string;
  readonly type: AgentEventType;
  readonly sequence: number;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string; // ISO timestamp
}

export const RUN_EVENT_STREAM_PREFIX = "run:events:";

export function runEventStream(runId: string): string {
  return `${RUN_EVENT_STREAM_PREFIX}${runId}`;
}
