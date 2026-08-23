/**
 * ToolManager. Per CLAUDE.md §11:
 *
 *   LLM → ToolCall → ToolManager → Permission check → Validation → Execution
 *
 * Responsibilities here:
 *   - resolve the tool from native + MCP registries,
 *   - validate arguments against its Zod schema,
 *   - ask the permission engine (ALLOW / DENY / REQUIRE_APPROVAL),
 *   - persist tool_calls + tool_results rows,
 *   - emit lifecycle events (tool.requested/started/completed),
 *   - truncate outputs before they reach the model,
 *   - record file_changes rows for anything that mutated the workspace.
 *
 * Persistence and event emission are injected as ports so this module stays
 * independent of Postgres/Redis and is unit-testable in isolation.
 */

import { z } from "zod";
import type { RunId, SessionId } from "@openlobster/types";
import type { Logger } from "pino";
import type { FileSystem } from "@openlobster/filesystem";
import { evaluatePermission, type WorkspacePolicy } from "./permission";
import { truncateForModel } from "./output-limits";
import { createNativeTools } from "./registry";
import { diffContents } from "./diff";
import type {
  Decision,
  IncomingToolCall,
  PermissionDecision,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from "./types";

export interface ToolEventSink {
  toolRequested(toolName: string, callId: string): void;
  toolStarted(toolName: string, callId: string): void;
  toolCompleted(toolName: string, callId: string, ok: boolean): void;
}

export interface ToolPersistencePort {
  createToolCall(input: {
    runId: RunId;
    sessionId: SessionId;
    toolName: string;
    args: Record<string, unknown>;
  }): Promise<string>; // returns toolCallId
  completeToolCall(toolCallId: string, input: {
    status: "pending" | "running" | "completed" | "failed" | "denied";
    error?: string | null;
    resultData?: Record<string, unknown> | null;
    exitCode?: number | null;
    stdout?: string | null;
    stderr?: string | null;
  }): Promise<void>;
  recordFileChange(input: {
    runId: RunId;
    workspaceId: string;
    path: string;
    operation: "create" | "update" | "delete" | "rename";
    beforeHash: string | null;
    afterHash: string | null;
    additions: number;
    deletions: number;
    diff: string | null;
  }): Promise<void>;
}

/** Raised when a call needs human approval; the harness drives the flow. */
export class ApprovalRequiredError extends Error {
  constructor(
    readonly toolName: string,
    readonly decision: PermissionDecision,
    readonly toolCallId: string,
  ) {
    super(`Approval required for ${toolName}: ${decision.reason}`);
    this.name = "ApprovalRequiredError";
  }
}

export class ToolDeniedError extends Error {
  constructor(
    readonly toolName: string,
    readonly reason: string,
    readonly toolCallId: string,
  ) {
    super(`Tool denied: ${toolName}: ${reason}`);
    this.name = "ToolDeniedError";
  }
}

const EXEC_TIMEOUT_MS = 120_000;
void EXEC_TIMEOUT_MS;

export interface ToolManagerOptions {
  readonly tools: ToolDefinition[];
  readonly policy?: WorkspacePolicy;
  readonly events: ToolEventSink;
  readonly persistence: ToolPersistencePort;
}

export class ToolManager {
  private readonly byName = new Map<string, ToolDefinition>();
  private readonly policy: WorkspacePolicy;

  constructor(private readonly opts: ToolManagerOptions) {
    for (const t of opts.tools) {
      if (this.byName.has(t.name)) {
        throw new Error(`Duplicate tool name: ${t.name}`);
      }
      this.byName.set(t.name, t);
    }
    this.policy = opts.policy ?? { autoApproveModify: false, allowExecute: true };
  }

  /** JSON-schema specs handed to the model gateway. */
  toolSpecs(): Array<{ name: string; description: string; parametersJsonSchema: Record<string, unknown> }> {
    return [...this.byName.values()].map((t) => ({
      name: t.name,
      description: `${t.description} [risk: ${t.riskLevel}]`,
      parametersJsonSchema: zodToJsonSchemaish(t.schema),
    }));
  }

  async execute(
    call: IncomingToolCall,
    ctx: ToolContext,
    runIds: { runId: RunId; sessionId: SessionId; workspaceId: string },
  ): Promise<ToolResult> {
    const { events, persistence } = this.opts;
    events.toolRequested(call.name, call.id);

    const tool = this.byName.get(call.name);
    let toolCallId = "";
    try {
      // --- Resolve + validate -------------------------------------------
      if (tool === undefined) {
        throw new Error(`Unknown tool: ${call.name}`);
      }
      const parsedArgs = tool.schema.safeParse(safeJsonParse(call.argumentsJson));
      if (!parsedArgs.success) {
        const issue = parsedArgs.error.issues[0];
        throw new Error(`Invalid arguments for ${call.name}: ${issue?.path.join(".")} ${issue?.message}`);
      }

      toolCallId = await persistence.createToolCall({
        runId: runIds.runId,
        sessionId: runIds.sessionId,
        toolName: call.name,
        args: parsedArgs.data as Record<string, unknown>,
      });

      // --- Permission gate ------------------------------------------------
      const decision = evaluatePermission(
        {
          toolName: call.name,
          riskLevel: tool.riskLevel,
          args: parsedArgs.data as Record<string, unknown>,
        },
        this.policy,
      );
      if (decision.decision === "DENY") {
        await persistence.completeToolCall(toolCallId, { status: "denied", error: decision.reason });
        throw new ToolDeniedError(call.name, decision.reason, toolCallId);
      }
      if (decision.decision === "REQUIRE_APPROVAL") {
        await persistence.completeToolCall(toolCallId, { status: "pending", error: `awaiting approval: ${decision.reason}` });
        throw new ApprovalRequiredError(call.name, decision, toolCallId);
      }

      // --- Execute ---------------------------------------------------------
      events.toolStarted(call.name, call.id);
      await persistence.completeToolCall(toolCallId, { status: "running" });

      const mutationSnapshot = await snapshotBeforeMutation(tool, parsedArgs.data, ctx.fs);
      const startedAt = Date.now();
      let result: ToolResult;
      try {
        result = await tool.execute(parsedArgs.data, ctx);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await persistence.completeToolCall(toolCallId, { status: "failed", error: message });
        events.toolCompleted(call.name, call.id, false);
        return { ok: false, outputForModel: `ERROR: ${message}` };
      }
      const durationMs = Date.now() - startedAt;

      await persistence.completeToolCall(toolCallId, {
        status: result.ok ? "completed" : "failed",
        resultData: result.data ?? null,
        exitCode: result.exitCode ?? null,
        stdout: result.outputForModel,
      });

      // --- File-change bookkeeping ----------------------------------------
      if (mutationSnapshot !== null) {
        await this.recordChange(mutationSnapshot, ctx.fs, runIds, toolCallId);
      }

      events.toolCompleted(call.name, call.id, result.ok);
      ctx.logger.debug({ tool: call.name, ok: result.ok, ms: durationMs }, "tool completed");
      return result;
    } catch (err) {
      if (
        err instanceof ApprovalRequiredError ||
        err instanceof ToolDeniedError ||
        (err instanceof Error && err.message.startsWith("Unknown tool:")) ||
        (err instanceof Error && err.message.startsWith("Invalid arguments"))
      ) {
        throw err; // control-flow errors propagate to the loop
      }
      const message = err instanceof Error ? err.message : String(err);
      if (toolCallId !== "") {
        await persistence.completeToolCall(toolCallId, { status: "failed", error: message }).catch(() => undefined);
      }
      events.toolCompleted(call.name, call.id, false);
      return { ok: false, outputForModel: `ERROR: ${truncateForModel(message, 2000).text}` };
    }
  }

  private async recordChange(
    snapshot: MutationSnapshot,
    fs: FileSystem,
    ids: { runId: RunId; workspaceId: string },
    _toolCallId: string,
  ): Promise<void> {
    const existsNow = (await fs.exists(snapshot.path).catch(() => false)) && snapshot.wasFile;
    const afterStr = existsNow ? await fs.readFile(snapshot.path).catch(() => null) : null;
    const stats = await diffContents(snapshot.path, snapshot.beforeContent, afterStr);
    const operation =
      snapshot.beforeContent === null ? "create" : afterStr === null ? "delete" : "update";
    if (snapshot.beforeContent === afterStr) return; // no-op write
    await this.opts.persistence.recordFileChange({
      runId: ids.runId,
      workspaceId: ids.workspaceId,
      path: snapshot.path,
      operation,
      beforeHash: snapshot.beforeContent === null ? null : sha256Hex(snapshot.beforeContent),
      afterHash: afterStr === null ? null : sha256Hex(afterStr),
      additions: stats.additions,
      deletions: stats.deletions,
      diff: stats.diff,
    });
  }
}

interface MutationSnapshot {
  readonly path: string;
  readonly wasFile: boolean;
  readonly beforeContent: string | null;
}
/**
 * For any non-read-only tool we opportunistically snapshot the file named by
 * an args.path property so the manager can compute diffs even if the tool
 * itself doesn't report them.
 */
async function snapshotBeforeMutation(
  tool: ToolDefinition,
  args: unknown,
  fs: FileSystem,
): Promise<MutationSnapshot | null> {
  if (tool.riskLevel === "read_only") return null;
  const maybePath = (args as Record<string, unknown>)?.["path"];
  if (typeof maybePath !== "string") return null;
  const stat = await fs.stat(maybePath).catch(() => null);
  if (stat === null || stat.isDirectory) {
    return { path: maybePath, wasFile: stat !== null && !stat.isDirectory, beforeContent: null };
  }
  const content = await fs.readFile(maybePath).catch(() => null);
  return { path: maybePath, wasFile: true, beforeContent: content };
}

import { createHash } from "node:crypto";
function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return {}; // validation below will produce a helpful error
  }
}

/**
 * Convert a Zod schema to a conservative JSON-schema-ish object.
 * We avoid the zod-to-json-schema dependency for MVP; providers accept this
 * simplified shape and it round-trips fine through all four adapters.
 */
function zodToJsonSchemaish(schema: z.ZodTypeAny): Record<string, unknown> {
  return describeZod(schema);
}

type JsonSchemaish = Record<string, unknown>;

function describeZod(schema: z.ZodTypeAny): JsonSchemaish {
  const def = schema._def as Record<string, unknown> & { typeName: string };
  switch (def.typeName) {
    case "ZodString": {
      const out: JsonSchemaish = { type: "string" };
      const checks = def.checks as Array<{ kind: string; value?: number }> | undefined;
      for (const c of checks ?? []) {
        if (c.kind === "min") out["minLength"] = c.value;
        if (c.kind === "max") out["maxLength"] = c.value;
      }
      return out;
    }
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum": {
      const values = def.values as readonly string[];
      return { type: "string", enum: [...values] };
    }
    case "ZodArray":
      return { type: "array", items: describeZod(def.type as z.ZodTypeAny) };
    case "ZodDefault":
      return describeZod(def.innerType as z.ZodTypeAny);
    case "ZodOptional":
      return describeZod(def.innerType as z.ZodTypeAny);
    case "ZodObject": {
      const shape = (def.shape as () => Record<string, z.ZodTypeAny>)();
      const props: Record<string, JsonSchemaish> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape)) {
        props[k] = describeZod(v);
        const isOptional =
          (v._def as { typeName: string }).typeName === "ZodDefault" ||
          (v._def as { typeName: string }).typeName === "ZodOptional";
        if (!isOptional) required.push(k);
      }
      const out: JsonSchemaish = { type: "object", properties: props };
      if (required.length > 0) out["required"] = required;
      return out;
    }
    default:
      return {};
  }
}
