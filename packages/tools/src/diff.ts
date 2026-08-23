/**
 * Diff support for file_changes rows.
 *
 * Real unified diffs come from `git diff --no-index` (see packages/git).
 * For workspaces without git we fall back to a cheap multiset line-count
 * approximation so additions/deletions are still populated.
 */

import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { CliGitService } from "@openlobster/git";

export interface FileDiffStats {
  readonly diff: string | null;
  readonly additions: number;
  readonly deletions: number;
}

/** Count added/removed lines by multiset difference (order-insensitive). */
function countLineChanges(before: string, after: string): { additions: number; deletions: number } {
  const count = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const line of s.split("\n")) {
      m.set(line, (m.get(line) ?? 0) + 1);
    }
    return m;
  };
  const b = count(before);
  const a = count(after);
  let additions = 0;
  let deletions = 0;
  for (const [line, n] of a) {
    const bn = b.get(line) ?? 0;
    if (n > bn) additions += n - bn;
  }
  for (const [line, n] of b) {
    const an = a.get(line) ?? 0;
    if (n > an) deletions += n - an;
  }
  return { additions, deletions };
}

/**
 * Produce a unified diff between two content strings using a temp dir +
 * `git diff --no-index`. Returns null diff when git is unavailable.
 */
export async function diffContents(
  relPathForDisplay: string,
  before: string | null,
  after: string | null,
): Promise<FileDiffStats> {
  if (before === after) return { diff: "", additions: 0, deletions: 0 };

  const stats = countLineChanges(before ?? "", after ?? "");

  try {
    const tmp = await mkdtemp(nodePath.join(tmpdir(), "ol-diff-"));
    try {
      // Use display names inside the diff header via --src-prefix trick:
      // simplest is to write files with distinct names and rewrite headers.
      const aPath = nodePath.join(tmp, "a");
      const bPath = nodePath.join(tmp, "b");
      if (before !== null) await writeFile(aPath, before, "utf8");
      if (after !== null) await writeFile(bPath, after, "utf8");

      const git = new CliGitService(tmp);
      const raw =
        before === null
          ? syntheticNewDiff(relPathForDisplay, after ?? "")
          : after === null
            ? syntheticDeleteDiff(relPathForDisplay, before)
            : rewriteHeaders(await git.diffFiles(aPath, bPath), relPathForDisplay);

      return { diff: raw, ...stats };
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  } catch {
    return { diff: null, ...stats };
  }
}

function rewriteHeaders(diff: string, path: string): string {
  return diff.replace(/^diff --git a\/.*$/m, `diff --git a/${path} b/${path}`)
    .replace(/^(---) a\/.*$/m, `$1 a/${path}`)
    .replace(/^(\+\+\+) b\/.*$/m, `$1 b/${path}`);
}

function syntheticNewDiff(path: string, content: string): string {
  const lines = content.split("\n").map((l) => `+${l}`);
  return [`diff --git a/${path} b/${path}`, "--- /dev/null", `+++ b/${path}`, "@@ -0,0 +1,", ...lines].join("\n");
}

function syntheticDeleteDiff(path: string, content: string): string {
  const lines = content.split("\n").map((l) => `-${l}`);
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, "+++ /dev/null", "@@ -1 +0,0 @@", ...lines].join("\n");
}
