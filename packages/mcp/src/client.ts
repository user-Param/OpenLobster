/**
 * Minimal MCP (Model Context Protocol) client over stdio.
 *
 * Implements the JSON-RPC 2.0 subset of the MCP lifecycle we need:
 *   initialize → tools/list → tools/call
 *
 * This is deliberately a small, dependency-free implementation of the wire
 * protocol rather than a vendored SDK: OpenLobster only consumes tools from
 * MCP servers, and the three methods above cover that surface. If/when we
 * adopt more MCP capabilities (resources, prompts, sampling), swap this file
 * for the official TypeScript SDK — the McpToolRegistry interface below is
 * the seam.
 *
 * Wire format: newline-delimited JSON-RPC messages on the child process'
 * stdin/stdout. stderr is piped to our logger.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Logger } from "pino";

let nextRequestId = 1;

export interface McpToolDescription {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Record<string, unknown>;
  readonly annotations?: {
    readonly readOnlyHint?: boolean;
    readonly destructiveHint?: boolean;
  };
}

export interface McpCallResult {
  readonly isError: boolean;
  readonly text: string;
}

export class McpConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpConnectionError";
  }
}

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class McpStdioClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, PendingRequest>();
  private buffer = "";
  private initialized = false;

  constructor(
    /** e.g. ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/path"] */
    private readonly command: readonly string[],
    private readonly logger: Logger,
    private readonly requestTimeoutMs = 30_000,
  ) {}

  async connect(): Promise<void> {
    const [cmd, ...args] = this.command;
    if (cmd === undefined) throw new McpConnectionError("Empty MCP command");

    this.proc = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    this.proc.on("error", (err) => {
      this.logger.error({ err: err.message }, "mcp process error");
      this.rejectAll(new McpConnectionError(`MCP process error: ${err.message}`));
    });
    this.proc.stdout!.setEncoding("utf8");
    this.proc.stdout!.on("data", (chunk: string) => this.onData(chunk));
    this.proc.stderr!.setEncoding("utf8");
    this.proc.stderr!.on("data", (chunk: string) => {
      this.logger.debug({ stderr: chunk.trim() }, "mcp server stderr");
    });

    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "openlobster", version: "0.0.0" },
    });
    // Initialized notification (no response expected).
    this.notify("notifications/initialized", {});
    this.initialized = true;
  }

  get isConnected(): boolean {
    return this.initialized && this.proc !== null;
  }

  async listTools(): Promise<McpToolDescription[]> {
    const res = await this.request("tools/list", {});
    const tools = res["tools"];
    return Array.isArray(tools) ? (tools as McpToolDescription[]) : [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    const res = await this.request("tools/call", { name, arguments: args });
    const isError = res["isError"] === true;
    const content = res["content"];
    let text = "";
    if (Array.isArray(content)) {
      for (const part of content as Array<Record<string, unknown>>) {
        if (part["type"] === "text" && typeof part["text"] === "string") {
          text += part["text"];
        }
      }
    }
    return { isError, text };
  }

  async close(): Promise<void> {
    this.initialized = false;
    const p = this.proc;
    this.proc = null;
    this.rejectAll(new McpConnectionError("MCP client closed"));
    if (p !== null) {
      p.stdin?.end();
      p.kill("SIGTERM");
      setTimeout(() => p.kill("SIGKILL"), 3_000).unref();
    }
  }

  // --- internals ---------------------------------------------------------

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line === "") continue;
      try {
        const msg = JSON.parse(line) as {
          id?: number;
          result?: Record<string, unknown>;
          error?: { message?: string };
        };
        const id = msg.id;
        if (typeof id === "number") {
          const entry = this.pending.get(id);
          if (entry) {
            clearTimeout(entry.timer);
            this.pending.delete(id);
            if (msg.error) {
              entry.reject(new Error(`MCP error: ${msg.error.message ?? "unknown"}`));
            } else {
              entry.resolve(msg.result ?? {});
            }
          }
        }
      } catch {
        this.logger.warn({ line: line.slice(0, 200) }, "malformed MCP message");
      }
    }
  }

  private request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.proc === null) return Promise.reject(new McpConnectionError("not connected"));
    const id = nextRequestId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc!.stdin.write(payload);
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.proc?.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  private rejectAll(err: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }
}
