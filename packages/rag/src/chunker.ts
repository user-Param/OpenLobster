/**
 * Code chunker. Per CLAUDE.md §9 (rag/chunker).
 *
 * Strategy: fixed-size line windows with overlap. AST-aware chunking
 * (Tree-sitter / TS compiler API) lands in packages/code-intelligence later;
 * the Chunk interface below is the stable contract the indexer and retriever
 * build on.
 */

export interface Chunk {
  readonly id: string; // `${filePath}:${startLine}-${endLine}:${hash8}`
  readonly filePath: string; // workspace-relative POSIX
  readonly startLine: number;
  readonly endLine: number;
  readonly content: string;
  readonly language: string;
}

const TARGET_LINES = 60;
const OVERLAP_LINES = 8;

const EXT_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".rb": "ruby",
  ".sql": "sql",
  ".md": "markdown",
  ".json": "json",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".css": "css",
  ".html": "html",
  ".sh": "shell",
};

export function languageForPath(path: string): string {
  const idx = path.lastIndexOf(".");
  const ext = idx === -1 ? "" : path.slice(idx).toLowerCase();
  return EXT_LANGUAGE[ext] ?? "text";
}

export function chunkFile(filePath: string, content: string): Chunk[] {
  const lines = content.split("\n");
  if (lines.length === 0) return [];
  const language = languageForPath(filePath);
  const chunks: Chunk[] = [];

  let start = 0;
  let part = 1;
  while (start < lines.length) {
    const end = Math.min(start + TARGET_LINES, lines.length);
    const slice = lines.slice(start, end);
    // Skip chunks that are entirely whitespace.
    if (!slice.every((l) => l.trim() === "")) {
      const contentStr = slice.join("\n");
      const hash8 = fnv1a32(contentStr).toString(16);
      chunks.push({
        id: `${filePath}:${start + 1}-${end}:${hash8}:${part}`,
        filePath,
        startLine: start + 1,
        endLine: end,
        content: contentStr,
        language,
      });
    }
    if (end === lines.length) break;
    start = end - OVERLAP_LINES;
    part++;
  }
  return chunks;
}

/** Tiny deterministic hash for content fingerprints (not cryptographic). */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
