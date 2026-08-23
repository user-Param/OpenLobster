/**
 * OpenAI-compatible chat completions provider. Also serves DeepSeek, whose
 * API is wire-compatible — see deepseek.ts which reuses this with a
 * different base URL and model list.
 */

import type { ModelProviderName } from "@openlobster/types";
import type { ModelRequest, ModelResponse } from "../types";
import { ProviderError, findModel, type ModelProvider, type ProviderContext } from "../provider";

interface WireToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface WireResponse {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: WireToolCall[];
    };
  }>;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export class OpenAICompatibleProvider implements ModelProvider {
  constructor(
    readonly name: ModelProviderName,
    readonly supportedModels: readonly string[],
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {}

  async generate(request: ModelRequest, ctx: ProviderContext): Promise<ModelResponse> {
    const messages: Array<Record<string, unknown>> = [];
    if (request.system !== undefined && request.system !== "") {
      messages.push({ role: "system", content: request.system });
    }
    for (const m of request.messages) {
      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: m.content ?? null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: tc.argumentsJson },
          })),
        });
      } else if (m.role === "tool") {
        messages.push({
          role: "tool",
          tool_call_id: m.toolCallId ?? "",
          content: m.content,
        });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature ?? 0.2,
    };
    if (request.tools && request.tools.length > 0) {
      body["tools"] = request.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parametersJsonSchema,
        },
      }));
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ctx.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderError(
        `${this.name} API error ${res.status}: ${text.slice(0, 500)}`,
        this.name,
        res.status,
        res.status === 429 || res.status >= 500,
      );
    }

    const data = (await res.json()) as WireResponse;
    const choice = data.choices?.[0];
    const info = findModel(request.model);
    const toolCalls = (choice?.message?.tool_calls ?? [])
      .filter((tc) => tc.function?.name !== undefined)
      .map((tc, i) => ({
        id: tc.id ?? `call_${i}`,
        name: tc.function!.name!,
        argumentsJson: tc.function!.arguments ?? "{}",
      }));

    return {
      model: data.model ?? request.model,
      provider: this.name,
      text: choice?.message?.content ?? null,
      toolCalls,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      finishReason:
        choice?.finish_reason === "tool_calls"
          ? "tool_calls"
          : choice?.finish_reason === "length"
            ? "length"
            : "stop",
      capabilities: info?.capabilities ?? [],
    };
  }
}
