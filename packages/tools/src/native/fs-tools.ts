/**
 * Native filesystem tools. Risk levels per CLAUDE.md §1 (Security):
 *   read_file / list_directory / search_files → READ_ONLY
 *   write_file / edit_file / delete_file      → MODIFY
 */

import { z } from "zod";
import { FileSystemError, type FileSystem } from "@openlobster/filesystem";
import type { ToolDefinition, ToolResult } from "../types";
import { truncateForModel } from "../output-limits";

const readFileSchema = z.object({
  path: z.string().min(1).describe("Workspace-relative file path"),
});
type ReadFileArgs = z.infer<typeof readFileSchema>;

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description:
    "Read a UTF-8 text file from the workspace and return its contents. " +
    "Returns an error for missing files; use list_directory to discover paths.",
  riskLevel: "read_only",
  schema: readFileSchema,
  async execute(rawArgs, ctx): Promise<ToolResult> {
    const args = readFileSchema.parse(rawArgs);
    try {
      const stat = await ctx.fs.stat(args.path);
      if (stat?.isDirectory) {
        return { ok: false, outputForModel: `ERROR: ${args.path} is a directory, not a file.` };
      }
      const content = await ctx.fs.readFile(args.path);
      const t = truncateForModel(content);
      return {
        ok: true,
        outputForModel: t.text,
        data: { path: args.path, bytes: Buffer.byteLength(content), truncated: t.truncated },
      };
    } catch (err) {
      return fail(err, args.path);
    }
  },
};

const listDirSchema = z.object({
  path: z.string().default("").describe("Workspace-relative directory path ('' = root)"),
});
type ListDirArgs = z.infer<typeof listDirSchema>;

export const listDirectoryTool: ToolDefinition = {
  name: "list_directory",
  description: "List the entries of a directory in the workspace.",
  riskLevel: "read_only",
  schema: listDirSchema,
  async execute(rawArgs, ctx): Promise<ToolResult> {
    const args = listDirSchema.parse(rawArgs);
    try {
      const entries = await ctx.fs.listDirectory(args.path === "" ? "." : args.path);
      const lines = entries.map(
        (e) => `${e.type === "directory" ? "d" : "-"} ${e.path}${e.type === "file" ? ` (${e.size}B)` : ""}`,
      );
      const t = truncateForModel(lines.join("\n"));
      return {
        ok: true,
        outputForModel: t.text || "(empty directory)",
        data: { count: entries.length },
      };
    } catch (err) {
      return fail(err, args.path || ".");
    }
  },
};

const searchSchema = z.object({
  pattern: z.string().min(1).max(500).describe("Regular expression"),
  path: z.string().default("").describe("Directory to search ('' = workspace root)"),
  maxResults: z.number().int().positive().max(200).default(50),
});
type SearchArgs = z.infer<typeof searchSchema>;

export const searchFilesTool: ToolDefinition = {
  name: "search_files",
  description:
    "Search file CONTENTS with a regular expression across text files under a directory. " +
    "Returns matching lines with their file paths and line numbers.",
  riskLevel: "read_only",
  schema: searchSchema,
  async execute(rawArgs, ctx): Promise<ToolResult> {
    const args = searchSchema.parse(rawArgs);
    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern);
    } catch {
      return { ok: false, outputForModel: `ERROR: invalid regular expression: ${args.pattern}` };
    }
    const matches: string[] = [];
    await walk(ctx.fs, args.path === "" ? "." : args.path, regex, args.maxResults, matches);

    const hitCap = matches.length >= args.maxResults;
    const t = truncateForModel(matches.join("\n"));
    return {
      ok: true,
      outputForModel: t.text || "(no matches)",
      data: { matchCount: matches.length, truncated: t.truncated || hitCap },
    };
  },
};

const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".txt",
  ".css", ".scss", ".html", ".yml", ".yaml", ".sql", ".sh", ".py", ".go", ".rs",
]);
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".turbo"]);

async function walk(
  fs: FileSystem,
  dirRel: string,
  regex: RegExp,
  maxResults: number,
  acc: string[],
): Promise<void> {
  if (acc.length >= maxResults) return;
  const entries = await fs.listDirectory(dirRel).catch(() => []);
  for (const e of entries) {
    if (acc.length >= maxResults) return;
    if (e.type === "directory") {
      if (!IGNORED_DIRS.has(e.name)) {
        await walk(fs, e.path, regex, maxResults, acc);
      }
    } else if (
      e.type === "file" &&
      (TEXT_EXT.has(extname(e.name)) || !e.name.includes("."))
    ) {
      const content = await fs.readFile(e.path).catch(() => null);
      if (content === null) continue;
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (regex.test(line)) {
          acc.push(`${e.path}:${i + 1}: ${line.trim().slice(0, 300)}`);
          if (acc.length >= maxResults) return;
        }
      }
    }
  }
}

function extname(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx);
}

function fail(err: unknown, path: string): ToolResult {
  if (err instanceof FileSystemError) {
    return { ok: false, outputForModel: `ERROR (${err.code}): ${err.message}` };
  }
  return { ok: false, outputForModel: `ERROR reading ${path}: ${String(err)}` };
}
