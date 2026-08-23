/**
 * Sandbox types. Per CLAUDE.md §13.
 *
 * A Sandbox is the ONLY place model-generated commands execute. The boundary:
 *
 *   ToolManager → Execution Policy → SandboxManager → SandboxInstance
 *                                                   → terminal/filesystem
 */

export interface SandboxSpec {
  readonly sandboxId: string;
  readonly workspaceId: string;
  /** Absolute path on the HOST that becomes /workspace inside the sandbox. */
  readonly hostWorkspacePath: string;
  readonly cpuLimit: number;
  readonly memoryLimit: string;
  readonly diskLimit: string;
  readonly networkPolicy: "restricted" | "open" | "none";
  readonly timeoutSeconds: number;
}

export interface ExecOptions {
  /** Shell command string executed via /bin/sh (or cmd on Windows images). */
  readonly command: string;
  readonly cwd?: string; // workspace-relative
  readonly env?: Record<string, string>; // scoped secret injection only
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}

export interface ExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly truncated: boolean;
}

/**
 * Lifecycle: create() → exec()* → destroy(). Instances are per-run and
 * never reused across runs.
 */
export interface Sandbox {
  start(): Promise<void>;
  exec(opts: ExecOptions): Promise<ExecResult>;
  stop(): Promise<void>;
}

export class SandboxError extends Error {
  constructor(message: string, readonly code: "START_FAILED" | "EXEC_FAILED" | "NOT_RUNNING") {
    super(message);
    this.name = "SandboxError";
  }
}
