/**
 * Anthropic Messages API provider.
 */

import type { ModelProviderName } from "@openlobster/types";
import type { ModelRequest, ModelResponse, ProposedToolCall } from "../types";
import { ProviderError, findModel, type ModelProvider, type ProviderContext } from "../provider";

interface WireBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface WireResponse {
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
  content?: WireBlock[];
}

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const VERSION = "2023-06-01";

export class AnthropicProvider implements ModelProvider {
  readonly name: ModelProviderName = "anthropic";

  constructor(readonly supportedModels: readonly string[] = ["claude-3-5-sonnet-20241022"]) {}

  async generate(request: ModelRequest, ctx: ProviderContext): Promise<ModelResponse> {
    // Anthropic takes system separately and does not accept role:"system".
    const messages = request.messages.map((m) => ({ role: m.role === "tool" ? "user" : m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature ?? 0.2,
      messages,
    };
    if (request.system !== undefined && request.system !== "") {
      body["system"] = request.system;
    }
    if (request.tools && request.tools.length > 0) {
      body["tools"] = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parametersJsonSchema,
      }));
    }

    const res = await fetch(`${DEFAULT_BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ctx.apiKey,
        "anthropic-version": VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderError(
        `anthropic API error ${res.status}: ${text.slice(0, 500)}`,
        this.name,
        res.status,
        res.status === 429 || res.status >= 500,
      );
    }

    const data = (await res.json()) as WireResponse;
    const info = findModel(request.model);

    let text = "";
    const toolCalls: ProposedToolCall[] = [];
    for (const block of data.content ?? []) {
      if (block.type === "text" && block.text !== undefined) {
        text += block.text;
      } else if (block.type === "tool_use" && block.name !== undefined) {
        toolCalls.push({
          id: block.id ?? `call_${toolCalls.length}`,
          name: block.name,
          argumentsJson: JSON.stringify(block.input ?? {}),
        });
      }
    }

    return {
      model: data.model ?? request.model,
      provider: this.name,
      text: text === "" ? null : text,
      toolCalls,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
      finishReason:
        data.stop_reason === "tool_use" ? "tool_calls" : data.stop_reason === "max_tokens" ? "length" : "stop",
      capabilities: info?.capabilities ?? [],
    };
  }
}
