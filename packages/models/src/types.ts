/**
 * Model Gateway domain types. Per CLAUDE.md §14.
 *
 * The Agent Loop only ever sees ModelRequest/ModelResponse — never a
 * provider SDK type. Tool calls are normalized into a flat shape shared by
 * all providers.
 */

import type { ModelCapability } from "@openlobster/types";

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  /** Present when role === "assistant" and the model requested tools. */
  readonly toolCalls?: readonly ProposedToolCall[];
  /** Present when role === "tool". */
  readonly toolCallId?: string;
}

export interface ProposedToolCall {
  readonly id: string;
  readonly name: string;
  /** JSON-encoded arguments object. */
  readonly argumentsJson: string;
}

export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  /** JSON Schema for the tool parameters. */
  readonly parametersJsonSchema: Record<string, unknown>;
}

export interface UsageDelta {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export type FinishReason = "stop" | "tool_calls" | "length" | "error";

export interface ModelRequest {
  readonly model: string;
  readonly system?: string;
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ToolSpec[];
  readonly maxOutputTokens: number;
  readonly temperature?: number;
}

export interface ModelResponse {
  readonly model: string;
  readonly provider: string;
  readonly text: string | null;
  readonly toolCalls: readonly ProposedToolCall[];
  readonly usage: UsageDelta;
  readonly finishReason: FinishReason;
  /** Capability set advertised for this model (informational). */
  readonly capabilities: readonly ModelCapability[];
}
