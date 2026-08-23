/**
 * DeepSeek provider — OpenAI wire-compatible, different base URL + models.
 */

import { OpenAICompatibleProvider } from "./openai";

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor() {
    super("deepseek", ["deepseek-chat", "deepseek-reasoner"], "https://api.deepseek.com/v1");
  }
}
