/**
 * Tool output limits. Per CLAUDE.md §15 (ToolOutputManager).
 *
 * Everything a tool returns to the model passes through truncateForModel.
 * Head+tail preservation keeps both error banners and final summaries
 * visible. Full oversized outputs would go to object storage in Phase 2;
 * for now we record that truncation happened via the returned flag.
 */

export interface TruncationResult {
  readonly text: string;
  readonly truncated: boolean;
}

const DEFAULT_MAX_CHARS = 12_000;

export function truncateForModel(text: string, maxChars = DEFAULT_MAX_CHARS): TruncationResult {
  if (text.length <= maxChars) return { text, truncated: false };
  const half = Math.floor(maxChars / 2);
  return {
    text: `${text.slice(0, half)}\n…[output truncated, ${text.length - maxChars} chars omitted]…\n${text.slice(-half)}`,
    truncated: true,
  };
}
