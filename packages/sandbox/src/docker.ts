/**
 * Docker-backed sandbox. Per CLAUDE.md §14: "Docker first".
 *
 * Strategy:
 *   - `docker run -d` a long-lived container per run with the workspace
 *     bind-mounted at /workspace, CPU/mem limits, and (default) no network.
 *   - Each exec is `docker exec` inside that container.
 *   - `docker rm -f` on stop.
 *
 * Output truncation happens here so huge command outputs never reach the
 * model or the DB unbounded (CLAUDE.md §15).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecOptions, ExecResult, Sandbox, SandboxSpec } from "./types";
import { SandboxError } from "./types";

const execFileAsync = promisify(execFile);

const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;

export class DockerSandbox implements Sandbox {
  private containerId: string | null = null;
  private startedAt: number | 0 = 0;

  constructor(
    private readonly spec: SandboxSpec,
    private readonly image: string,
    private readonly dockerHostPathMap?: (hostPath: string) => string,
  ) {}

  async start(): Promise<void> {
    const args = [
      "run",
      "-d",
      "--name",
      `openlobster-${this.spec.sandboxId}`,
      "--cpus",
      String(this.spec.cpuLimit),
      "--memory",
      this.spec.memoryLimit,
      "--network",
      this.spec.networkPolicy === "open" ? "bridge" : "none",
      "--workdir",
      "/workspace",
      "--volume",
      `${this.map(this.spec.hostWorkspacePath)}:/workspace`,
      // Keep the container alive; execs do the real work.
      "--entrypoint",
      "/bin/sh",
      this.image,
      "-c",
      "sleep infinity",
    ];
    try {
      const { stdout } = await execFileAsync("docker", args, { timeout: 60_000 });
      this.containerId = stdout.trim();
      this.startedAt = Date.now();
    } catch (err) {
      throw new SandboxError(
        `Failed to start docker sandbox: ${(err as Error).message}`,
        "START_FAILED",
      );
    }
  }

  async exec(opts: ExecOptions): Promise<ExecResult> {
    if (this.containerId === null) {
      throw new SandboxError("Sandbox not started", "NOT_RUNNING");
    }
    // Enforce the sandbox-level wall clock as well as per-exec timeout.
    const elapsedSec = (Date.now() - this.startedAt) / 1000;
    const remainingSpecSeconds = this.spec.timeoutSeconds - elapsedSec;
    const timeoutMs = Math.min(
      opts.timeoutMs ?? 30_000,
      Math.max(1_000, remainingSpecSeconds * 1000),
    );

    const maxBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    let truncated = false;

    const args = [
      "exec",
      "-w",
      `/workspace/${opts.cwd ?? ""}`.replace(/\/+$/, "") || "/workspace",
      ...(opts.env
        ? Object.entries(opts.env).flatMap(([k, v]) => ["--env", `${k}=${v}`])
        : []),
      this.containerId,
      "/bin/sh",
      "-c",
      opts.command,
    ];

    try {
      const child = execFileAsync("docker", args, {
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: Number.MAX_SAFE_INTEGER, // we truncate ourselves
      });
      const { stdout, stderr } = await child;
      return {
        exitCode: 0,
        stdout: truncate(stdout, maxBytes),
        stderr: truncate(stderr, maxBytes),
        timedOut: false,
        truncated,
      };
    } catch (err) {
      const e = err as NodeJS.ErrnoException & {
        code?: number | string;
        signal?: string;
        killed?: boolean;
        stdout?: string;
        stderr?: string;
      };
      const timedOut = e.killed === true || e.signal === "SIGKILL" || e.code === "ETIMEDOUT";
      if (!timedOut && typeof e.code !== "number") {
        throw new SandboxError(`docker exec failed: ${e.message}`, "EXEC_FAILED");
      }
      const stdout = e.stdout ?? "";
      const stderr = e.stderr ?? "";
      if (stdout.length + stderr.length > maxBytes) truncated = true;
      return {
        exitCode: typeof e.code === "number" ? e.code : 1,
        stdout: truncate(stdout, maxBytes),
        stderr: truncate(timedOut ? `${stderr}\n[openlobster] command timed out`.trim() : stderr, maxBytes),
        timedOut,
        truncated,
      };
    }

    function truncate(s: string, max: number): string {
      const buf = Buffer.byteLength(s, "utf8");
      if (buf <= max) return s;
      truncated = true;
      // Keep head and tail so errors at both ends survive.
      const half = Math.floor(max / 2);
      return (
        s.slice(0, half) +
        "\n…[output truncated]…\n" +
        s.slice(-half)
      );
    }
  }

  async stop(): Promise<void> {
    if (this.containerId === null) return;
    try {
      await execFileAsync("docker", ["rm", "-f", this.containerId], { timeout: 30_000 });
    } finally {
      this.containerId = null;
    }
  }

  /** Docker Desktop on macOS needs /var/folders etc. mapped through the VM. */
  private map(hostPath: string): string {
    return this.dockerHostPathMap ? this.dockerHostPathMap(hostPath) : hostPath;
  }
}
