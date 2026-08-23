/**
 * CheckpointManager. Per CLAUDE.md §5 (agent_checkpoints) + §4 (Checkpoint /
 * recovery rules).
 *
 * A checkpoint captures enough of the loop to resume after a pause or a
 * worker crash: iteration number, accumulated token/cost totals, and the
 * conversation so far (JSON-serializable). Sequence numbers are per-run and
 * monotonic so the newest checkpoint is trivially identified.
 */

import { desc, eq } from "drizzle-orm";
import type { Db } from "@openlobster/db";
import { agentCheckpoints } from "@openlobster/db/schema";

export interface CheckpointState {
  readonly iteration: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export interface CheckpointData extends CheckpointState {
  /** Conversation messages in provider-neutral form. */
  readonly conversation: unknown[];
}

export class CheckpointManager {
  constructor(private readonly db: Db, private readonly runId: string) {}

  async save(state: CheckpointState, conversation: unknown[]): Promise<void> {
    const [latest] = await this.db
      .select({ sequence: agentCheckpoints.sequence })
      .from(agentCheckpoints)
      .where(eq(agentCheckpoints.runId, this.runId))
      .orderBy(desc(agentCheckpoints.sequence))
      .limit(1);
    const nextSeq = (latest?.sequence ?? -1) + 1;

    await this.db.insert(agentCheckpoints).values({
      runId: this.runId,
      sequence: nextSeq,
      state: { ...state },
      context: { conversation },
    });
  }

  async loadLatest(): Promise<CheckpointData | null> {
    const [row] = await this.db
      .select()
      .from(agentCheckpoints)
      .where(eq(agentCheckpoints.runId, this.runId))
      .orderBy(desc(agentCheckpoints.sequence))
      .limit(1);
    if (row === undefined) return null;
    const state = row.state as unknown as CheckpointState;
    const ctx = row.context as { conversation?: unknown[] };
    return {
      iteration: Number(state.iteration ?? 0),
      inputTokens: Number(state.inputTokens ?? 0),
      outputTokens: Number(state.outputTokens ?? 0),
      costUsd: Number(state.costUsd ?? 0),
      conversation: Array.isArray(ctx.conversation) ? ctx.conversation : [],
    };
  }
}
