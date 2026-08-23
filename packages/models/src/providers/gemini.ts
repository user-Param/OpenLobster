/**
 * Google Gemini generateContent provider.
 */

import type { ModelProviderName } from "@openlobster/types";
import type { ModelRequest, ModelResponse, ProposedToolCall } from "../types";
import { ProviderError, findModel, type ModelProvider, type ProviderContext } from "../provider";

interface WirePart {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
}

interface WireResponse {
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: WirePart[] };
  }>;
}

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function toGeminiModelName(id: string): string {
  // Catalog ids look like "gemini-1.5-flash"; the API wants
  // "models/gemini-1.5-flash". Pass through anything already prefixed.
  return id.startsWith("models/") ? id : `models/${id}`;
}

export class GeminiProvider implements ModelProvider {
  readonly name: ModelProviderName = "gemini";

  constructor(readonly supportedModels: readonly string[] = ["gemini-1.5-flash"]) {}

  async generate(request: ModelRequest, ctx: ProviderContext): Promise<ModelResponse> {
    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxOutputTokens,
        temperature: request.temperature ?? 0.2,
      },
    };
    if (request.system !== undefined && request.system !== "") {
      body["systemInstruction"] = { parts: [{ text: request.system }] };
    }
    if (request.tools && request.tools.length > 0) {
      body["tools"] = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name.replace(/[^A-Za-z0-9_.-]/g, "_"),
            description: t.description,
            parameters: t.parametersJsonSchema,
          })),
        },
      ];
    }

    const url = `${BASE_URL}/${toGeminiModelName(request.model)}:generateContent?key=${encodeURIComponent(ctx.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderError(
        `gemini API error ${res.status}: ${text.slice(0, 500)}`,
        this.name,
        res.status,
        res.status === 429 || res.status >= 500,
      );
    }

    const data = (await res.json()) as WireResponse;
    const cand = data.candidates?.[0];
    const info = findModel(request.model);

    let text = "";
    const toolCalls: ProposedToolCall[] = [];
    for (const part of cand?.content?.parts ?? []) {
      if (part.text !== undefined) text += part.text;
      if (part.functionCall?.name !== undefined) {
        toolCalls.push({
          id: `call_${toolCalls.length}`,
          name: part.functionCall.name!,
          argumentsJson: JSON.stringify(part.functionCall.args ?? {}),
        });
      }
    }

    return {
      model: request.model,      provider: this.name,
      text: text === "" ? null : text,
      toolCalls,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
      finishReason:
        cand?.finishReason === "MAX_TOKENS"
          ? "length"
          : toolCalls.length > 0
            ? "tool_calls"
            : "stop",
      capabilities: info?.capabilities ?? [],
    };
  }
}
