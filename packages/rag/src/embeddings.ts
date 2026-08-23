/**
 * Embedding providers. Per CLAUDE.md §8 ("ChromaDB alone isn't enough —
 * you need an embedding model") and the EmbeddingProvider interface from
 * the tech-stack section.
 *
 * MVP ships the OpenAI text-embedding adapter (batched); local models plug
 * in by implementing the same interface.
 */

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

export interface EmbeddingProvider {
  /** Dimensionality of produced vectors. */
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

const OPENAI_BATCH_LIMIT = 128;
const OPENAI_URL = "https://api.openai.com/v1/embeddings";

interface OpenAIEmbedResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
}

export class OpenAIEmbeddings implements EmbeddingProvider {
  readonly dimensions: number;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = "text-embedding-3-small",
    dimensions = 1536,
  ) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text]);
    if (vec === undefined) throw new EmbeddingError("empty embedding response");
    return vec;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += OPENAI_BATCH_LIMIT) {
      const batch = texts.slice(i, i + OPENAI_BATCH_LIMIT);
      out.push(...(await this.oneCall(batch)));
    }
    return out;
  }

  private async oneCall(batch: string[]): Promise<number[][]> {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: batch }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new EmbeddingError(`OpenAI embeddings error ${res.status}: ${t.slice(0, 300)}`);
    }
    const data = (await res.json()) as OpenAIEmbedResponse;
    const sorted = [...(data.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return sorted.map((d) => d.embedding ?? []);
  }
}
