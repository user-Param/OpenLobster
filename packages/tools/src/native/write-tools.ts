/**
 * Mutating filesystem tools (write_file / edit_file / delete_file).
 *
 * These are MODIFY-risk: the ToolManager records a file_changes row for each
 * one (before/after hashes, additions/deletions, unified diff) and the
 * permission engine may require user approval.
 */

import { z } from "zod";
import { sha256 } from "@openlobster/filesystem";
import type { ToolDefinition, ToolResult } from "../types";

const writeFileSchema = z.object({
  path: z.string().min(1),
  content: z.string().max(2_000_000).describe("Full new file content"),
});
type WriteFileArgs = z.infer<typeof writeFileSchema>;

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  description:
    "Create or overwrite a file in the workspace with the given full content. " +
    "Parent directories are created automatically.",
  riskLevel: "modify",
  schema: writeFileSchema,
  async execute(rawArgs, ctx): Promise<ToolResult> {
    const args = writeFileSchema.parse(rawArgs);
    const existed = await ctx.fs.exists(args.path);
    const result = await ctx.fs.writeFile(args.path, args.content);

    return {
      ok: true,
      outputForModel: `OK: ${existed ? "overwrote" : "created"} ${args.path} (${Buffer.byteLength(args.content)} bytes)`,
      data: {
        path: args.path,
        operation: existed ? "update" : "create",
        beforeHash: result.beforeHash,
        afterHash: result.afterHash,
      },
    };
  },
};

const editFileSchema = z.object({
  path: z.string().min(1),
  oldString: z.string().min(1).describe("Exact text to replace"),
  newString: z.string().describe("Replacement text"),
  replaceAll: z.boolean().default(false),
});
type EditFileArgs = z.infer<typeof editFileSchema>;

export const editFileTool: ToolDefinition = {
  name: "edit_file",
  description:
    "Replace an exact substring inside an existing workspace file. " +
    "The oldString must match exactly once unless replaceAll is true.",
  riskLevel: "modify",
  schema: editFileSchema,
  async execute(rawArgs, ctx): Promise<ToolResult> {
    const args = editFileSchema.parse(rawArgs);
    if (!(await ctx.fs.exists(args.path))) {
      return { ok: false, outputForModel: `ERROR: no such file: ${args.path}` };
    }
    const before = await ctx.fs.readFile(args.path);
    const occurrences = before.split(args.oldString).length - 1;
    if (occurrences === 0) {
      return {
        ok: false,
        outputForModel: `ERROR: oldString not found in ${args.path}. Re-read the file to get its exact current content.`,
      };
    }
    if (occurrences > 1 && !args.replaceAll) {
      return {
        ok: false,
        outputForModel: `ERROR: oldString appears ${occurrences} times in ${args.path}. Add more surrounding context or set replaceAll=true.`,
      };
    }
    const after = args.replaceAll
      ? before.split(args.oldString).join(args.newString)
      : before.replace(args.oldString, () => args.newString);
    await ctx.fs.writeFile(args.path, after);

    return {
      ok: true,
      outputForModel: `OK: edited ${args.path} (${occurrences} replacement${occurrences === 1 ? "" : "s"})`,
      data: {
        path: args.path,
        operation: "update",
        replacements: occurrences,
        beforeHash: sha256(before),
        afterHash: sha256(after),
      },
    };
  },
};

const deleteFileSchema = z.object({
  path: z.string().min(1),
});
type DeleteFileArgs = z.infer<typeof deleteFileSchema>;

export const deleteFileTool: ToolDefinition = {
  name: "delete_file",
  description: "Delete a single file from the workspace.",
  riskLevel: "destructive",
  schema: deleteFileSchema,
  async execute(rawArgs, ctx): Promise<ToolResult> {
    const args = deleteFileSchema.parse(rawArgs);
    let beforeHash: string | null = null;
    try {
      const before = await ctx.fs.readFile(args.path);
      beforeHash = sha256(before);
    } catch {
      // File may already be gone; deletion below will surface the real error.
    }
    await ctx.fs.deleteFile(args.path);
    return {
      ok: true,
      outputForModel: `OK: deleted ${args.path}`,
      data: { path: args.path, operation: "delete", beforeHash },
    };
  },
};
