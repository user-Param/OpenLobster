/**
 * ModelGateway — the only way the rest of the system talks to LLMs.
 * Per CLAUDE.md §14: ProviderRegistry, ModelRouter, RetryManager,
 * FallbackManager. Token/cost accounting is exposed via onUsage callbacks
 * so the Harness can persist usage_records.
 */

import type { AppConfig } from "@openlobster/config";
import type { Logger } from "pino";
import { AnthropicProvider } from "./providers/anthropic";
import { DeepSeekProvider } from "./providers/deepseek";
import { GeminiProvider } from "./providers/gemini";
import { OpenAICompatibleProvider } from "./providers/openai";
import {
  MODEL_CATALOG,
  ProviderError,
  findModel,
  type ModelInfo,
  type ModelProvider,
  type ProviderContext,
} from "./provider";
import type { ModelRequest, ModelResponse, UsageDelta } from "./types";

export interface UsageListener {
  (modelId: string, provider: string, usage: UsageDelta): void;
}

export interface GatewayOptions {
  /** Explicit preference order for auto routing; defaults to catalog order filtered by availability. */
  readonly autoPreference?: readonly string[];
}

const MAX_ATTEMPTS_PER_PROVIDER = 3;
const RETRY_BASE_DELAY_MS = 500;

export class ModelGateway {
  private readonly providers = new Map<string, ModelProvider>();
  private readonly credentials = new Map<string, string>();
  private readonly listeners: UsageListener[] = [];

  constructor(cfg: AppConfig, private readonly logger?: Logger) {
    const p = cfg.providers;
    if (p.anthropic.apiKey !== undefined) {
      this.providers.set("anthropic", new AnthropicProvider());
      this.credentials.set("anthropic", p.anthropic.apiKey);
    }
    if (p.openai.apiKey !== undefined) {
      this.providers.set("openai", new OpenAICompatibleProvider("openai", ["gpt-4o", "gpt-4o-mini"]));
      this.credentials.set("openai", p.openai.apiKey);
    }
    if (p.deepseek.apiKey !== undefined) {
      this.providers.set("deepseek", new DeepSeekProvider());
      this.credentials.set("deepseek", p.deepseek.apiKey);
    }
    if (p.gemini.apiKey !== undefined) {
      this.providers.set("gemini", new GeminiProvider());
      this.credentials.set("gemini", p.gemini.apiKey);
    }
  }

  onUsage(listener: UsageListener): void {
    this.listeners.push(listener);
  }

  /** Models actually usable with the configured API keys. */
  availableModels(): ModelInfo[] {
    return MODEL_CATALOG.filter((m) => this.providers.has(m.provider));
  }

  /**
   * Auto-route: first configured model in preference order that has a key.
   */
  routeAuto(preference?: readonly string[]): ModelInfo | null {
    const order = preference ?? MODEL_CATALOG.map((m) => m.id);
    for (const id of order) {
      const info = findModel(id);
      if (info && this.providers.has(info.provider)) return info;
    }
    return null;
  }

  async generate(requestSpec: Omit<ModelRequest, "model"> & { model?: string }): Promise<ModelResponse> {
    // Resolve target + fallback chain.
    let primary: ModelInfo;
    if (requestSpec.model !== undefined && requestSpec.model !== "" && requestSpec.model !== "auto") {
      const found = findModel(requestSpec.model);
      if (!found) throw new Error(`Unknown model: ${requestSpec.model}`);
      primary = found;
    } else {
      const routed = this.routeAuto();
      if (routed === null) throw new Error("No model providers configured (set an API key)");
      primary = routed;
    }
    const chain = [primary, ...this.fallbacksFor(primary)];

    let lastError: Error | null = null;
    for (const candidate of chain) {
      try {
        return await this.generateWithRetries(candidate, requestSpec);
      } catch (err) {
        lastError = err as Error;
        this.logger?.warn(
          { model: candidate.id, provider: candidate.provider, err: (err as Error).message },
          "model provider failed; trying fallback",
        );
      }
    }
    throw lastError ?? new Error("All model providers failed");
  }

  private fallbacksFor(primary: ModelInfo): ModelInfo[] {
    // Prefer cheaper/other vendors that are configured and support tool calling.
    return MODEL_CATALOG.filter(
      (m) =>
        m.id !== primary.id &&
        m.provider !== primary.provider &&
        m.capabilities.includes("tool_calling") &&
        this.providers.has(m.provider),
    );
  }

  private async generateWithRetries(model: ModelInfo, spec: Omit<ModelRequest, "model">): Promise<ModelResponse> {
    const provider = this.providers.get(model.provider);
    const apiKey = this.credentials.get(model.provider);
    if (provider === undefined || apiKey === undefined) {
      throw new ProviderError(`Provider not configured: ${model.provider}`, model.provider);
    }
    const ctx: ProviderContext = { apiKey };
    const request: ModelRequest = {
      ...spec,
      model: model.id,
      maxOutputTokens: Math.min(spec.maxOutputTokens, model.maxOutputTokens),
    };

    let delayMs = RETRY_BASE_DELAY_MS;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROVIDER; attempt++) {
      try {
        const response = await provider.generate(request, ctx);
        for (const l of this.listeners) {
          l(response.model, response.provider, response.usage);
        }
        return response;
      } catch (err) {
        const retryable =
          err instanceof ProviderError ? err.retryable : true; // network errors are retryable too
        if (!retryable || attempt === MAX_ATTEMPTS_PER_PROVIDER) throw err;
        await sleep(delayMs);
        delayMs *= 2;
      }
    }
    throw new ProviderError("unreachable", model.provider); // appease control flow analysis
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
