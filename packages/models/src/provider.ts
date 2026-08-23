/**
 * Provider interface + registry of model descriptors.
 *
 * Providers adapt vendor HTTP APIs into ModelRequest/ModelResponse. We call
 * them over `fetch` rather than vendor SDKs to keep the dependency surface
 * small and the retry/fallback logic ours (CLAUDE.md §12: AI SDK is optional;
 * our own ModelGateway interface is the domain boundary).
 */

import type { ModelCapability, ModelProviderName } from "@openlobster/types";
import type { ModelRequest, ModelResponse } from "./types";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ModelProviderName,
    readonly status?: number,
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ProviderContext {
  readonly apiKey: string;
}

export interface ModelProvider {
  readonly name: ModelProviderName;
  /** Models this provider can serve, in preference order. */
  readonly supportedModels: readonly string[];
  generate(request: ModelRequest, ctx: ProviderContext): Promise<ModelResponse>;
}

export interface ModelInfo {
  readonly id: string;
  readonly provider: ModelProviderName;
  readonly contextWindow: number;
  readonly maxOutputTokens: number;
  readonly capabilities: readonly ModelCapability[];
  readonly inputCostPer1k: number | null;
  readonly outputCostPer1k: number | null;
}

/**
 * Curated catalog. Costs are USD per 1k tokens, list price, for budget
 * tracking only — the authoritative bill always comes from the provider.
 */
export const MODEL_CATALOG: readonly ModelInfo[] = [
  {
    id: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    capabilities: ["tool_calling", "vision", "streaming"],
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
  },
  {
    id: "gpt-4o",
    provider: "openai",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    capabilities: ["tool_calling", "vision", "streaming", "structured_output"],
    inputCostPer1k: 0.0025,
    outputCostPer1k: 0.01,
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    capabilities: ["tool_calling", "streaming", "structured_output"],
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
  },
  {
    id: "deepseek-chat",
    provider: "deepseek",
    contextWindow: 64_000,
    maxOutputTokens: 8_192,
    capabilities: ["tool_calling", "streaming"],
    inputCostPer1k: 0.00014,
    outputCostPer1k: 0.00028,
  },
  {
    id: "gemini-1.5-flash",
    provider: "gemini",
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    capabilities: ["tool_calling", "vision", "streaming"],
    inputCostPer1k: 0.000075,
    outputCostPer1k: 0.0003,
  },
];

export function findModel(modelId: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === modelId);
}
