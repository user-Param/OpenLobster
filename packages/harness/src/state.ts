/**
 * Agent Run state machine. Per CLAUDE.md §4.
 *
 *   QUEUED → STARTING → RUNNING ⇄ WAITING_TOOL/WAITING_APPROVAL/PAUSED
 *                       RUNNING → COMPLETED | FAILED | CANCELLED | TIMEOUT
 *
 * Enforced here AND at the DB layer (CHECK constraint on terminal states);
 * both layers failing open would require two independent bugs.
 */

import type { RunStatus } from "@openlobster/types";

export class InvalidTransitionError extends Error {
  constructor(readonly from: RunStatus, readonly to: RunStatus) {
    super(`Invalid run transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["starting", "cancelled"],
  starting: ["running", "failed", "cancelled", "queued"], // queued = release back on workspace-busy
  running: [
    "waiting_tool",
    "waiting_approval",
    "paused",
    "completed",
    "failed",
    "cancelled",
    "timeout",
  ],
  waiting_tool: ["running", "failed", "cancelled"],
  waiting_approval: ["running", "failed", "cancelled", "timeout"],
  paused: ["starting", "cancelled"], // resume goes through the queue again
  completed: [],
  failed: [],
  cancelled: [],
  timeout: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/** Terminal statuses after which a run can never move again. */
export function isTerminal(status: RunStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
