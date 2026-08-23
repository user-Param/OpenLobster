/**
 * Minimal ChromaDB REST client (server API v1, compatible with the
 * chromadb/chroma 0.5.x images pinned in docker-compose.yml).
 *
 * We talk raw REST instead of the `chromadb` npm package to avoid client/
 * server version drift and keep dependencies near zero. Only the calls the
 * indexer + retriever need are implemented:
 *   - get-or-create collection
 *   - upsert (ids, embeddings, documents, metadatas)
 *   - query (by embedding, top-k)
 *   - delete (by where filter)
 */

export class ChromaError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ChromaError";
  }
}

export interface ChromaMetadata {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly filePath: string;
  readonly language: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly contentHash: string;
}

interface CollectionResponse {
  id?: string;
  name?: string;
}

export interface QueryMatch {
  readonly id: string;
  readonly document: string | null;
  readonly distance: number;
  readonly metadata: Record<string, unknown>;
}

const TENANT = "default_tenant";
const DATABASE = "default_database";

export class ChromaClient {
  constructor(private readonly baseUrl: string) {}

  private url(path: string): string {
    return `${this.baseUrl}/api/v1${path}`;
  }

  async heartbeat(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/heartbeat`);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Get or create a collection by name; returns its id. */
  async getOrCreateCollection(name: string): Promise<string> {
    const existing = await fetch(
      this.url(`/collections/${encodeURIComponent(name)}?tenant=${TENANT}&database=${DATABASE}`),
    );
    if (existing.ok) {
      const data = (await existing.json()) as CollectionResponse;
      if (data.id !== undefined) return data.id;
    }
    const res = await fetch(this.url(`/collections?tenant=${TENANT}&database=${DATABASE}`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, get_or_create: true }),
    });
    if (!res.ok) {
      throw new ChromaError(`create collection failed: ${await res.text()}`, res.status);
    }
    const data = (await res.json()) as CollectionResponse;
    if (data.id === undefined) throw new ChromaError("collection id missing in response");
    return data.id;
  }

  async upsert(
    collectionId: string,
    items: {
      ids: string[];
      embeddings: number[][];
      documents: string[];
      metadatas: Record<string, unknown>[];
    },
  ): Promise<void> {
    const res = await fetch(this.url(`/collections/${collectionId}/upsert`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ids: items.ids,
        embeddings: items.embeddings,
        documents: items.documents,
        metadatas: items.metadatas,
      }),
    });
    if (!res.ok) throw new ChromaError(`upsert failed: ${res.status}`, res.status);
  }

  async query(
    collectionId: string,
    embedding: number[],
    k: number,
    where?: Record<string, unknown>,
  ): Promise<QueryMatch[]> {
    const res = await fetch(this.url(`/collections/${collectionId}/query`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query_embeddings: [embedding],
        n_results: k,
        include: ["documents", "metadatas", "distances"],
        ...(where !== undefined ? { where } : {}),
      }),
    });
    if (!res.ok) throw new ChromaError(`query failed: ${res.status}`, res.status);
    const data = (await res.json()) as {
      ids?: string[][];
      documents?: Array<Array<string | null>>;
      distances?: number[][];
      metadatas?: Array<Array<Record<string, unknown>>>;
    };
    const ids = data.ids?.[0] ?? [];
    const docs = data.documents?.[0] ?? [];
    const dists = data.distances?.[0] ?? [];
    const metas = data.metadatas?.[0] ?? [];
    const out: QueryMatch[] = [];
    for (let i = 0; i < ids.length; i++) {
      out.push({
        id: ids[i] ?? "",
        document: docs[i] ?? null,
        distance: dists[i] ?? Number.MAX_VALUE,
        metadata: metas[i] ?? {},
      });
    }
    return out;
  }

  async deleteWhere(collectionId: string, where: Record<string, unknown>): Promise<void> {
    await fetch(this.url(`/collections/${collectionId}/delete`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ where }),
    }).catch(() => undefined);
  }

  async count(collectionId: string): Promise<number> {
    const res = await fetch(this.url(`/collections/${collectionId}/count`));
    if (!res.ok) return 0;
    return Number(await res.text());
  }
}
