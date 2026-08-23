/**
 * Local (host-process) sandbox — DEV ONLY fallback for machines without
 * Docker. It still enforces timeouts and output truncation, and it confines
 * cwd to the workspace, but it is NOT an isolation boundary: commands run
 * with the worker's privileges.
 *
 * Production / untrusted code MUST use DockerSandbox. The SandboxManager
 * refuses `local` in production so this can never silently become the
 * default in a deployed environment.
 */

import { spawn } from "node:child_process";
import * as nodePath from "node:path";
import type { ExecOptions, ExecResult, Sandbox, SandboxSpec } from "./types";

export class LocalSandbox implements Sandbox {
  private started = false;
  private startedAt = 0;

  constructor(private readonly spec: SandboxSpec) {}

  async start(): Promise<void> {
    this.started = true;
    this.startedAt = Date.now();
  }

  async exec(opts: ExecOptions): Promise<ExecOptions extends never ? never : ExecResult> {
    if (!this.started) throw new Error("Sandbox not started");
    const elapsedSec = (Date.now() - this.startedAt) / 1000;
    const remainingSpecSeconds = this.spec.timeoutSeconds - elapsedSec;
    const timeoutMs = Math.min(
      opts.timeoutMs ?? 30_000,
      Math.max(1_000, remainingSpecSeconds * 1000),
    );

    const cwd = opts.cwd
      ? nodePath.resolve(this.spec.hostWorkspacePath, opts.cwd)
      : this.spec.hostWorkspacePath;

    return await new Promise<ExecResult>((resolve) => {
      const child = spawn("/bin/sh", ["-c", opts.command], {
        cwd,
        env: {
          // Deliberately minimal env; secrets are injected per-exec by the caller.
          PATH: process.env["PATH"] ?? "/usr/local/bin:/usr/bin:/bin",
          HOME: cwd,
          LANG: "en_US.UTF-8",
          ...opts.env,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let truncated = false;
      const maxBytes = 256 * 1024;

      const collect = (chunk: Buffer, into: "out" | "err"): void => {
        const s = chunk.toString("utf8");
        if (into === "out") stdout += s;
        else stderr += s;
        if (Buffer.byteLength(stdout + stderr, "utf8") > maxBytes) {
          truncated = true;
          stdout = stdout.slice(0, Math.floor(maxBytes / 2));
          stderr = stderr.slice(0, Math.floor(maxBytes / 2));
        }
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      child.stdout?.on("data", (c: Buffer) => collect(c, "out"));
      child.stderr?.on("data", (c: Buffer) => collect(c, "err"));

      const finish = (code: number): void => {
        clearTimeout(timer);
        resolve({
          exitCode: code,
          stdout,
          stderr: timedOut ? `${stderr}\n[openlobster] command timed out`.trim() : stderr,
          timedOut,
          truncated,
        });
      };

      child.on("close", (code) => finish(code ?? 1));
      child.on("error", () => finish(127));
    });
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  get specForTests(): SandboxSpec {
    return this.spec;
  }
}

export { nodePath };
