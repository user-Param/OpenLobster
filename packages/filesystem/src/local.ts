/**
 * Filesystem abstraction. Per CLAUDE.md §15.
 *
 * Tools receive a FileSystem rooted at the workspace — never `node:fs`.
 * This gives us:
 *   - path containment (no ../../ escapes, no symlink escapes),
 *   - a seam for the sandboxed filesystem in Phase 2,
 *   - testability without touching disk.
 */

import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import * as nodePath from "node:path";

export interface FileEntry {
  readonly name: string;
  readonly path: string; // workspace-relative, POSIX separators
  readonly type: "file" | "directory" | "symlink" | "other";
  readonly size: number;
}

export interface WriteResult {
  /** SHA-256 of content before the write (null if file did not exist). */
  readonly beforeHash: string | null;
  /** SHA-256 of content after the write. */
  readonly afterHash: string;
}

export interface FileSystem {
  readFile(path: string): Promise<string>;
  readFileBuffer(path: string): Promise<Buffer>;
  writeFile(path: string, content: string): Promise<WriteResult>;
  deleteFile(path: string): Promise<void>;
  rename(fromPath: string, toPath: string): Promise<void>;
  listDirectory(path: string): Promise<FileEntry[]>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<{ size: number; isDirectory: boolean } | null>;
  mkdirp(path: string): Promise<void>;
}

export class FileSystemError extends Error {
  constructor(
    message: string,
    readonly code:
      | "OUTSIDE_ROOT"
      | "NOT_FOUND"
      | "IS_DIRECTORY"
      | "IO_ERROR",
  ) {
    super(message);
    this.name = "FileSystemError";
  }
}

/**
 * Resolve a user/tool-supplied relative path against the root and guarantee
 * containment. Absolute paths are accepted only if they are already inside
 * the root (useful when tools echo back paths we produced).
 */
export function resolveInsideRoot(rootAbs: string, relOrAbs: string): string {
  const abs = nodePath.isAbsolute(relOrAbs)
    ? nodePath.normalize(relOrAbs)
    : nodePath.resolve(rootAbs, relOrAbs);
  const normRoot = nodePath.resolve(rootAbs);
  const withSep = normRoot.endsWith(nodePath.sep) ? normRoot : normRoot + nodePath.sep;
  if (abs !== normRoot && !abs.startsWith(withSep)) {
    throw new FileSystemError(
      `Path escapes workspace root: ${relOrAbs}`,
      "OUTSIDE_ROOT",
    );
  }
  return abs;
}

function toRelPosix(rootAbs: string, abs: string): string {
  return nodePath.relative(rootAbs, abs).split(nodePath.sep).join("/");
}

/**
 * Local-disk implementation rooted at a workspace directory.
 */
export class LocalFileSystem implements FileSystem {
  constructor(private readonly rootAbs: string) {}

  private abs(rel: string): string {
    return resolveInsideRoot(this.rootAbs, rel);
  }

  async readFile(rel: string): Promise<string> {
    try {
      return await fsp.readFile(this.abs(rel), "utf8");
    } catch (err) {
      throw this.wrap(err, rel);
    }
  }

  async readFileBuffer(rel: string): Promise<Buffer> {
    try {
      return await fsp.readFile(this.abs(rel));
    } catch (err) {
      throw this.wrap(err, rel);
    }
  }

  async writeFile(rel: string, content: string): Promise<WriteResult> {
    const abs = this.abs(rel);
    let beforeHash: string | null = null;
    try {
      const before = await fsp.readFile(abs, "utf8").catch(() => null);
      if (before !== null) beforeHash = sha256(before);
      await fsp.mkdir(nodePath.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, content, "utf8");
      return { beforeHash, afterHash: sha256(content) };
    } catch (err) {
      throw this.wrap(err, rel);
    }
  }

  async deleteFile(rel: string): Promise<void> {
    try {
      await fsp.unlink(this.abs(rel));
    } catch (err) {
      throw this.wrap(err, rel);
    }
  }

  async rename(fromRel: string, toRel: string): Promise<void> {
    const from = this.abs(fromRel);
    const to = this.abs(toRel);
    try {
      await fsp.mkdir(nodePath.dirname(to), { recursive: true });
      await fsp.rename(from, to);
    } catch (err) {
      throw this.wrap(err, `${fromRel} -> ${toRel}`);
    }
  }

  async listDirectory(rel: string): Promise<FileEntry[]> {
    const abs = this.abs(rel);
    let dirents;
    try {
      dirents = await fsp.readdir(abs, { withFileTypes: true });
    } catch (err) {
      throw this.wrap(err, rel);
    }
    const baseRel = toRelPosix(this.rootAbs, abs);
    const out: FileEntry[] = [];
    for (const d of dirents) {
      const childRel = baseRel === "" ? d.name : `${baseRel}/${d.name}`;
      let size = 0;
      if (d.isFile()) {
        size = await fsp.stat(nodePath.join(abs, d.name)).then(
          (s) => s.size,
          () => 0,
        );
      }
      out.push({
        name: d.name,
        path: childRel,
        type: d.isDirectory()
          ? "directory"
          : d.isFile()
            ? "file"
            : d.isSymbolicLink()
              ? "symlink"
              : "other",
        size,
      });
    }
    // Deterministic order for the model's benefit.
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }

  async exists(rel: string): Promise<boolean> {
    try {
      await fsp.access(this.abs(rel));
      return true;
    } catch {
      return false;
    }
  }

  async stat(rel: string): Promise<{ size: number; isDirectory: boolean } | null> {
    try {
      const s = await fsp.stat(this.abs(rel));
      return { size: s.size, isDirectory: s.isDirectory() };
    } catch {
      return null;
    }
  }

  async mkdirp(rel: string): Promise<void> {
    await fsp.mkdir(this.abs(rel), { recursive: true });
  }

  private wrap(err: unknown, rel: string): FileSystemError {
    if (err instanceof FileSystemError) return err;
    const e = err as NodeJS.ErrnoException;
    if (e?.code === "ENOENT") {
      return new FileSystemError(`No such file or directory: ${rel}`, "NOT_FOUND");
    }
    if (e?.code === "EISDIR") {
      return new FileSystemError(`Is a directory: ${rel}`, "IS_DIRECTORY");
    }
    return new FileSystemError(`IO error on ${rel}: ${e?.message ?? String(err)}`, "IO_ERROR");
  }
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
