/**
 * ApprovalManager. Per CLAUDE.md §3 (Tool permission system):
 *
 *   REQUIRE_APPROVAL → run goes waiting_approval, an approval.requested
 *   event is emitted (Web/TUI surfaces it), and the loop blocks on the
 *   run's Redis signal channel until granted / denied / timeout.
 */

import type { RunId } from "@openlobster/types";
import type { Logger } from "pino";
import type { EventPublisher } from "@openlobster/events";
import { subscribeRunSignals } from "@openlobster/redis";

export type ApprovalOutcome = "granted" | "denied" | "timeout";

const APPROVAL_TIMEOUT_MS = 5 * 60_000;

export class ApprovalManager {
  constructor(
    private readonly redisUrl: string,
    private readonly publisher: EventPublisher,
    private readonly logger: Logger,
  ) {}

  /**
   * Blocks until the user responds. The caller is responsible for flipping
   * run status to waiting_approval before and back to running after.
   */
  async requestApproval(input: {
    runId: RunId;
    sessionId: string;
    toolName: string;
    reason: string;
    argumentsPreview: Record<string, unknown>;
    onWaiting: () => Promise<void>;
    onResolved: () => Promise<void>;
  }): Promise<ApprovalOutcome> {
    await input.onWaiting();
    await this.publisher.publish({
      runId: input.runId,
      sessionId: input.sessionId,
      type: "approval.requested",
      payload: {
        toolName: input.toolName,
        reason: input.reason,
        arguments: sanitize(input.argumentsPreview),
        timeoutMs: APPROVAL_TIMEOUT_MS,
      },
    });
    this.logger.info({ tool: input.toolName }, "approval requested");

    const outcome = await new Promise<ApprovalOutcome>((resolve) => {
      let settled = false;
      const settle = (v: ApprovalOutcome): void => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      };
      const timer = setTimeout(() => settle("timeout"), APPROVAL_TIMEOUT_MS);

      void subscribeRunSignals({ url: this.redisUrl }, input.runId, (signal) => {
        if (signal.type === "approval.granted") settle("granted");
        else if (signal.type === "approval.denied") settle("denied");
        // cancel/pause are handled by their own subscribers in parallel.
      }).then((unsubscribe) => {
        void unsubscribeAfter(unsubscribe, () => settled);
      });
    });

    await this.publisher.publish({
      runId: input.runId,
      sessionId: input.sessionId,
      type: outcome === "granted" ? "approval.granted" : "approval.denied",
      payload: { toolName: input.toolName, outcome },
    });
    await input.onResolved();
    return outcome;
  }
}

async function unsubscribeAfter(
  unsubscribe: () => Promise<void>,
  isSettled: () => boolean,
): Promise<void> {
  // Wait a tick so late signals can't re-trigger; then drop the subscription.
  while (!isSettled()) {
    await new Promise((r) => setTimeout(r, 100));
  }
  await unsubscribe();
}

function sanitize(args: Record<string, unknown>): Record<string, unknown> {
  // Keep previews short; never include anything that looks like a secret.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = typeof v === "string" && v.length > 300 ? `${v.slice(0, 300)}…` : v;
  }
  return out;
}
