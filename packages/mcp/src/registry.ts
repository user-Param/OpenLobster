/**
 * MCPToolRegistry — adapts MCP server tools into OpenLobster ToolDefinitions.
 * Per CLAUDE.md §12: the Tool Manager exposes a consistent interface whether
 * a tool is native or MCP-based.
 *
 * Risk mapping (conservative):
 *   destructiveHint=true            → destructive (requires approval)
 *   readOnlyHint=true               → read_only
 *   anything else                   → modify     (requires approval by default)
 */

import { z } from "zod";
import type { ToolRiskLevel } from "@openlobster/types";
import type { Logger } from "pino";
import { McpStdioClient, type McpToolDescription } from "./client";
import type { ToolContext, ToolDefinition, ToolResult } from "@openlobster/tools";

export interface McpServerConfig {
  readonly name: string;
  readonly command: readonly string[];
}

export interface McpTool extends ToolDefinition {
  /** Fully-qualified name to avoid collisions across servers. */
  readonly mcpQualified: string;
}

function riskFor(tool: McpToolDescription): ToolRiskLevel {
  if (tool.annotations?.destructiveHint === true) return "destructive";
  if (tool.annotations?.readOnlyHint === true) return "read_only";
  return "modify";
}

/**
 * Connects to the configured MCP servers, lists their tools, and returns
 * ToolDefinitions that proxy execution over MCP.
 */
export async function loadMcpTools(
  servers: readonly McpServerConfig[],
  logger: Logger,
  ctxFactory: () => Pick<ToolContext, never> | undefined = () => undefined,
): Promise<McpTool[]> {
  void ctxFactory;
  const out: McpTool[] = [];
  for (const server of servers) {
    const client = new McpStdioClient(server.command, logger.child({ mcpServer: server.name }));
    try {
      await client.connect();
      const tools = await client.listTools();
      for (const t of tools) {
        if (t.name === undefined) continue;
        out.push(wrapMcpTool(server.name, client, t));
      }
      logger.info({ server: server.name, tools: tools.length }, "mcp tools loaded");
    } catch (err) {
      logger.warn({ server: server.name, err: (err as Error).message }, "mcp server failed; skipping");
      await client.close().catch(() => undefined);
    }
  }
  return out;
}

function wrapMcpTool(serverName: string, client: McpStdioClient, desc: McpToolDescription): McpTool {
  const qualified = `mcp_${serverName}_${desc.name}`;
  // MCP input schemas are JSON Schema; we accept them loosely and pass through.
  const schema = z.record(z.unknown()).describe("Arguments per the tool's JSON Schema");

  return {
    mcpQualified: qualified,
    name: qualified,
    description: `[mcp:${serverName}] ${desc.description ?? desc.name}`,
    riskLevel: riskFor(desc),
    schema,
    async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const result = await client.callTool(desc.name, (args as Record<string, unknown>) ?? {});
      if (result.isError) {
        return { ok: false, outputForModel: result.text };
      }
      return { ok: true, outputForModel: result.text, data: {} };
    },
  };
}
