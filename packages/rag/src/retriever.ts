/**
 * RAG pipeline: QueryBuilder → Retriever → Ranker/Formatter. Per CLAUDE.md §9.
 *
 * MVP QueryBuilder extracts keywords (identifier-ish tokens) from the task
 * prompt; the retriever embeds the query and asks Chroma for top-k, scoped
 * to this workspace via a `where` filter so one collection can serve many
 * workspaces safely.
 */

import { ChromaClient } from "./chroma";
import type { EmbeddingProvider } from "./embeddings";

export interface RetrievedChunk {
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly content: string;
  readonly score: number; // 1 - distance, higher = better
}

export interface RetrieverOptions {
  readonly k?: number;
  /** Minimum similarity (1 - cosine distance) to include. */
  readonly minScore?: number;
}

const DEFAULT_K = 8;
const DEFAULT_MIN_SCORE = 0.3;

export class RagRetriever {
  private readonly chroma: ChromaClient;
  private collectionId: string | null = null;

  constructor(
    baseUrl: string,
    private readonly embeddings: EmbeddingProvider,
    private readonly collectionName: string,
    private readonly workspaceId: string,
  ) {
    this.chroma = new ChromaClient(baseUrl);
  }

  private async ensureCollection(): Promise<string> {
    if (this.collectionId === null) {
      this.collectionId = await this.chroma.getOrCreateCollection(this.collectionName);
    }
    return this.collectionId;
  }

  async retrieve(query: string, opts: RetrieverOptions = {}): Promise<RetrievedChunk[]> {
    const collectionId = await this.ensureCollection();
    const embeddingQuery = buildQuery(query);
    const vector = await this.embeddings.embed(embeddingQuery);
    const matches = await this.chroma.query(
      collectionId,
      vector,
      opts.k ?? DEFAULT_K,
      { workspaceId: this.workspaceId },
    );
    return matches
      .map((m) => ({
        filePath: String(m.metadata["filePath"] ?? ""),
        startLine: Number(m.metadata["startLine"] ?? 0),
        endLine: Number(m.metadata["endLine"] ?? 0),
        content: m.document ?? "",
        score: 1 - m.distance,
      }))
      .filter((c) => c.score >= (opts.minScore ?? DEFAULT_MIN_SCORE) && c.filePath !== "")
      .sort((a, b) => b.score - a.score);
  }
}

/**
 * QueryBuilder MVP: keep identifier-like tokens and quoted strings from the
 * prompt — these match code far better than prose. Falls back to the raw
 * query when extraction yields nothing.
 */
export function buildQuery(prompt: string): string {
  const keywords =
    prompt
      .split(/[^A-Za-z0-9_$]+/)
      .filter((t) => t.length >= 3)
      .slice(0, 24)
      .join(" ") || prompt;
  return keywords.slice(0, 1000);
}

/** Format retrieved chunks for inclusion in model context. */
export function formatChunks(chunks: readonly RetrievedChunk[], maxChars = 24_000): string {
  if (chunks.length === 0) return "(no repository context retrieved)";
  let out = "";
  for (const c of chunks) {
    const block = `--- ${c.filePath}:${c.startLine}-${c.endLine} (score ${c.score.toFixed(2)}) ---\n${c.content}\n`;
    if (out.length + block.length > maxChars) break;
    out += block;
  }
  return out;
}
