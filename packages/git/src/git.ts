/**
 * Git service abstraction. Per CLAUDE.md §16 (packages/git).
 *
 * Implementation shells out to the `git` CLI via execFile (no arguments are
 * passed through a shell, so command injection is not possible). All paths
 * are workspace-relative; the service is constructed with the workspace root.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitStatusEntry {
  readonly path: string;
  readonly indexStatus: string;
  readonly worktreeStatus: string;
}

export interface GitStatus {
  readonly branch: string;
  readonly entries: GitStatusEntry[];
}

export interface GitCommitInfo {
  readonly hash: string;
  readonly subject: string;
  readonly authorName: string;
  readonly dateIso: string;
}

export class GitError extends Error {
  constructor(
    message: string,
    readonly args: readonly string[],
    readonly stderr?: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

export interface GitService {
  status(): Promise<GitStatus>;
  diff(path?: string): Promise<string>;
  log(limit?: number): Promise<GitCommitInfo[]>;
  currentBranch(): Promise<string>;
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<string>; // returns commit hash
  branch(name: string): Promise<void>;
  checkout(branch: string): Promise<void>;
  /** Unified diff of two arbitrary files — used for file_changes.diff. */
  diffFiles(aPath: string, bPath: string): Promise<string>;
}

const FIELD_SEP = "\x1f"; // unit separator — cannot appear in paths

export class CliGitService implements GitService {
  constructor(private readonly cwdAbs: string) {}

  private async git(args: readonly string[], timeoutMs = 30_000): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", [...args], {
        cwd: this.cwdAbs,
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
      });
      return stdout;
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      throw new GitError(`git ${args[0] ?? ""} failed: ${e.message}`, args, e.stderr);
    }
  }

  async status(): Promise<GitStatus> {
    const out = await this.git(["status", "--porcelain=v1", `-z`, "--branch"]);
    const parts = out.split("\0");
    let branch = "HEAD";
    const entries: GitStatusEntry[] = [];
    for (let i = 0; i < parts.length; i++) {
      const line = parts[i];
      if (line === undefined || line === "") continue;
      if (line.startsWith("## ")) {
        const m = /^## ([^\s.]+)/.exec(line.slice(3));
        if (m?.[1]) branch = m[1];
        continue;
      }
      const next = parts[i + 1];
      // -z renames come as two sequential entries; skip the second.
      const fields = next !== undefined && !next.startsWith("##") && /^[^ ]/.test(next) && line.length >= 3
        ? [line]
        : [line];
      void fields;
      const idx = line.slice(0, 2);
      const path = line.slice(3);
      if (path === "") continue;
      entries.push({
        path,
        indexStatus: idx[0] ?? " ",
        worktreeStatus: idx[1] ?? " ",
      });
      // If rename entry consumed an extra slot, skip it.
      if (next !== undefined && idx.includes("R")) i++;
    }
    return { branch, entries };
  }

  async diff(relPath?: string): Promise<string> {
    const args = ["diff", "--no-color"];
    if (relPath !== undefined && relPath !== "") args.push("--", relPath);
    return this.git(args);
  }

  async log(limit = 20): Promise<GitCommitInfo[]> {
    const fmt = [`%H`, `%s`, `%an`, `%aI`].join(FIELD_SEP);
    const out = await this.git(["log", `--pretty=format:${fmt}`, "-n", String(limit)]);
    return out
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((line) => {
        const [hash, subject, author, date] = line.split(FIELD_SEP);
        return {
          hash: hash ?? "",
          subject: subject ?? "",
          authorName: author ?? "",
          dateIso: date ?? "",
        };
      });
  }

  async currentBranch(): Promise<string> {
    const out = await this.git(["rev-parse", "--abbrev-ref", "HEAD"]);
    return out.trim();
  }

  async add(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.git(["add", "--", ...paths]);
  }

  async commit(message: string): Promise<string> {
    await this.git(["commit", "-m", message]);
    const out = await this.git(["rev-parse", "HEAD"]);
    return out.trim();
  }

  async branch(name: string): Promise<void> {
    await this.git(["branch", name]);
  }

  async checkout(branch: string): Promise<void> {
    await this.git(["checkout", branch]);
  }

  /**
   * Real unified diff between two on-disk files using
   * `git diff --no-index`. Used to populate file_changes.diff without
   * shipping a custom diff algorithm. Falls back to empty string when git
   * exits 1 (which for --no-index means "differences found").
   */
  async diffFiles(aAbs: string, bAbs: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["diff", "--no-index", "--no-color", "--unified=3", aAbs, bAbs],
        { cwd: this.cwdAbs, timeout: 10_000, maxBuffer: 16 * 1024 * 1024 },
      );
      return stdout;
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stdout?: string };
      // Exit code 1 == differences found (expected). Anything else is real.
      if (String(e.code) === "1") {
        return e.stdout ?? "";
      }
      return "";
    }
  }
}
