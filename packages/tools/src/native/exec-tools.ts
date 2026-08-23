/**
 * Execution + git tools.
 *
 * execute_command runs inside the sandbox (never on the worker host) and is
 * EXECUTE-risk; the permission engine screens the command string first.
 * Git tools wrap the CliGitService and are read-only except git_commit
 * (MODIFY-risk: it changes repository state but not remote).
 */

import { z } from "zod";
import type { ToolDefinition, ToolResult } from "../types";
import { truncateForModel } from "../output-limits";

const execSchema = z.object({
  command: z.string().min(1).max(10_000).describe("Shell command to run inside the sandbox"),
  cwd: z.string().default("").describe("Workspace-relative working directory"),
  timeoutMs: z.number().int().positive().max(600_000).default(60_000),
});
type ExecArgs = z.infer<typeof execSchema>;

export const executeCommandTool: ToolDefinition = {
  name: "execute_command",
  description:
    "Run a shell command in the sandboxed workspace (e.g. npm test, python script.py). " +
    "The sandbox has no network by default. Output is truncated when huge.",
  riskLevel: "execute",
  schema: execSchema,
  async execute(rawArgs, ctx): Promise<ToolResult> {
    const args = execSchema.parse(rawArgs);
    ctx.logger.info({ command: args.command }, "sandbox exec");
    const result = await ctx.sandbox.exec({
      command: args.command,
      ...(args.cwd === "" ? {} : { cwd: args.cwd }),
      timeoutMs: args.timeoutMs ?? 120_000,
    });
    const combined = [
      result.exitCode !== 0 ? `exit code: ${result.exitCode}` : null,
      result.stdout,
      result.stderr !== "" ? `stderr:\n${result.stderr}` : null,
      result.truncated ? "[output truncated]" : null,
    ]
      .filter((x): x is string => x !== null)
      .join("\n");
    const t = truncateForModel(combined);
    return {
      ok: result.exitCode === 0 && !result.timedOut,
      outputForModel: t.text,
      exitCode: result.exitCode,
      data: { command: args.command, timedOut: result.timedOut, truncated: t.truncated },
    };
  },
};

const pathArg = z.object({
  path: z.string().default("").describe("Optional workspace-relative path"),
});

export const gitStatusTool: ToolDefinition = {
  name: "git_status",
  description: "Show the working tree status (branch + changed files).",
  riskLevel: "read_only",
  schema: pathArg,
  async execute(_args, ctx): Promise<ToolResult> {
    if (ctx.git === null) return noGit();
    const status = await ctx.git.status();
    const lines = [`branch: ${status.branch}`, ...status.entries.map((e) => `${e.indexStatus}${e.worktreeStatus} ${e.path}`)];
    const t = truncateForModel(lines.join("\n"));
    return { ok: true, outputForModel: t.text || "(clean tree)", data: { branch: status.branch } };
  },
};

export const gitDiffTool: ToolDefinition = {
  name: "git_diff",
  description: "Show the current unstaged diff (optionally for one file).",
  riskLevel: "read_only",
  schema: pathArg,
  async execute(args, ctx): Promise<ToolResult> {
    if (ctx.git === null) return noGit();
    const parsed = pathArg.parse(args);
    const diff = await ctx.git.diff(parsed.path === "" ? undefined : parsed.path);
    const t = truncateForModel(diff);
    return { ok: true, outputForModel: t.text || "(no diff)", data: {} };
  },
};

const commitSchema = z.object({
  message: z.string().min(1).max(500).describe("Commit message"),
  paths: z.array(z.string()).min(1).describe("Workspace-relative paths to stage and commit"),
});
type CommitArgs = z.infer<typeof commitSchema>;

export const gitCommitTool: ToolDefinition = {
  name: "git_commit",
  description: "Stage specific paths and create a local commit. Never pushes.",
  riskLevel: "modify",
  schema: commitSchema,
  async execute(rawArgs, ctx): Promise<ToolResult> {
    if (ctx.git === null) return noGit();
    const args = commitSchema.parse(rawArgs);
    await ctx.git.add(args.paths);
    const hash = await ctx.git.commit(args.message);
    return { ok: true, outputForModel: `OK: committed ${hash}`, data: { hash } };
  },
};

function noGit(): ToolResult {
  return { ok: false, outputForModel: "ERROR: this workspace is not a git repository." };
}
