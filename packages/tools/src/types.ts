/**
 * Tool domain types. Per CLAUDE.md §11.
 *
 * The LLM never executes anything directly:
 *   LLM → ToolCall → ToolManager → Permission check → Validation → Tool
 */

import type { Logger } from "pino";
import { z } from "zod";
import type { ToolRiskLevel } from "@openlobster/types";
import type { FileSystem } from "@openlobster/filesystem";
import type { GitService } from "@openlobster/git";
import type { Sandbox } from "@openlobster/sandbox";

export interface ToolContext {
  readonly runId: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  /** Workspace-relative cwd for relative operations. */
  readonly workingDir: string;
  readonly fs: FileSystem;
  readonly git: GitService | null; // null when workspace is not a git repo
  readonly sandbox: Sandbox;
  readonly logger: Logger;
}

export interface ToolResult {
  readonly ok: boolean;
  /** Model-facing textual summary (already truncated by the manager). */
  readonly outputForModel: string;
  /** Structured payload persisted to tool_results.result. */
  readonly data?: Record<string, unknown>;
  readonly exitCode?: number;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly riskLevel: ToolRiskLevel;
  readonly schema: z.ZodTypeAny;
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}

/** The normalized tool request coming from the model. */
export interface IncomingToolCall {
  readonly id: string;
  readonly name: string;
  readonly argumentsJson: string;
}

export type Decision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface PermissionDecision {
  readonly decision: Decision;
  readonly reason: string;
}
