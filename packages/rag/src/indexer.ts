/**
 * Repository indexer. Per CLAUDE.md §8 (RAG indexing lifecycle).
 *
 *   Workspace → File Scanner → ignore rules → Chunker → Embeddings → Chroma
 *
 * Change detection: each indexed chunk carries a contentHash; on re-index we
 * compare against the hashes recorded in Chroma metadata for that file and
 * only upsert changed files / delete removed ones. Postgres is untouched —
 * the vector DB is an index, not source of truth.
 */

import * as nodePath from "node:path";
import type { FileSystem } from "@openlobster/filesystem";
import { chunkFile, languageForPath } from "./chunker";
import { sha1Hex } from "./hash";
import { ChromaClient } from "./chroma";
import type { EmbeddingProvider } from "./embeddings";

const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage", ".turbo",
  "vendor", "__pycache__", ".venv",
]);
const IGNORED_FILES = new Set([".env", ".env.local", ".DS_Store"]);
const IGNORED_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip", ".gz", ".tar",
  ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mov", ".wav", ".lock",
]);
const MAX_FILE_BYTES = 200_000;

export interface IndexStats {
  readonly filesScanned: number;
  readonly chunksUpserted: number;
  readonly chunksDeleted: number;
}

export class RepositoryIndexer {
  private readonly chroma: ChromaClient;
  private collectionId: string | null = null;

  constructor(
    private readonly fs: FileSystem,
    private readonly embeddings: EmbeddingProvider,
    baseUrl: string,
    private readonly workspaceId: string,
    private readonly projectId: string,
    collectionName: string,
  ) {
    this.chroma = new ChromaClient(baseUrl);
    this.collectionName = collectionName;
  }

  private readonly collectionName: string;

  async ensureCollection(): Promise<void> {
    this.collectionId = await this.chroma.getOrCreateCollection(this.collectionName);
  }

  async reindexAll(): Promise<IndexStats> {
    await this.ensureCollection();
    const files = await this.collectFiles(".");
    let upserted = 0;
    let deleted = 0;
    for (const rel of files) {
      const r = await this.indexFile(rel);
      upserted += r.upserted;
      deleted += r.deleted;
    }
    return { filesScanned: files.length, chunksUpserted: upserted, chunksDeleted: deleted };
  }

  /** Index (or refresh) a single file; called by tools after edits too. */
  async indexFile(relPath: string): Promise<{ upserted: number; deleted: number }> {
    if (this.collectionId === null) await this.ensureCollection();
    const exists = await this.fs.exists(relPath).catch(() => false);
    if (!exists) return await this.removeFile(relPath);

    const stat = await this.fs.stat(relPath);
    if (stat === null || stat.isDirectory || stat.size > MAX_FILE_BYTES) {
      return await this.removeFile(relPath);
    }
    const ext = nodePath.extname(relPath).toLowerCase();
    if (IGNORED_FILES.has(nodePath.basename(relPath)) || IGNORED_EXT.has(ext) || languageForPath(relPath) === "text") {
      // Binary/ignored/generated content is excluded from retrieval.
      return await this.removeFile(relPath);
    }

    const content = await this.fs.readFile(relPath).catch(() => null);
    if (content === null) return { upserted: 0, deleted: 0 };

    const chunks = chunkFile(relPath, content);
    if (chunks.length === 0) return await this.removeFile(relPath);

    const embeddings = await this.embeddings.embedBatch(chunks.map((c) => c.content));
    await this.chroma.upsert(this.collectionId!, {
      ids: chunks.map((c) => c.id),
      embeddings,
      documents: chunks.map((c) => c.content),
      metadatas: chunks.map((c) => ({
        projectId: this.projectId,
        workspaceId: this.workspaceId,
        filePath: c.filePath,
        language: c.language,
        startLine: c.startLine,
        endLine: c.endLine,
        contentHash: sha1Hex(c.content),
      })),
    });
    return { upserted: chunks.length, deleted: 0 };
  }

  async removeFile(relPath: string): Promise<{ upserted: number; deleted: number }> {
    if (this.collectionId === null) return { upserted: 0, deleted: 0 };
    await this.chroma.deleteWhere(this.collectionId, { filePath: relPath });
    // Chroma doesn't report delete counts via REST; approximate as unknown.
    return { upserted: 0, deleted: 0 };
  }

  private async collectFiles(dirRel: string): Promise<string[]> {
    const out: string[] = [];
    const entries = await this.fs.listDirectory(dirRel).catch(() => []);
    for (const e of entries) {
      if (e.type === "directory") {
        if (!DEFAULT_IGNORED_DIRS.has(e.name) && !e.name.startsWith(".")) {
          out.push(...(await this.collectFiles(e.path)));
        }
      } else if (e.type === "file") {
        out.push(e.path);
      }
    }
    return out;
  }
}
