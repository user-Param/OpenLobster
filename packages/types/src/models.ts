/**
 * Provider capability metadata for the Model Gateway.
 * Not in CLAUDE.md directly — derived from §14 "Provider abstraction needs
 * model capabilities". Keep here so it lives with the rest of the domain types.
 */

export type ModelCapability =
  | "tool_calling"
  | "vision"
  | "streaming"
  | "structured_output"
  | "reasoning"
  | "embedding";

export type ModelProviderName = "openai" | "anthropic" | "gemini" | "deepseek" | "local";

/**
 * Lightweight metadata about a model. The authoritative source of model
 * configuration will live in `packages/models`; this type just establishes
 * the shape we expose to the rest of the system.
 */
export interface ModelDescriptor {
  readonly id: string;
  readonly provider: ModelProviderName;
  readonly contextWindow: number;
  readonly maxOutputTokens: number;
  readonly capabilities: readonly ModelCapability[];
  readonly inputCostPer1k: number | null;
  readonly outputCostPer1k: number | null;
}
