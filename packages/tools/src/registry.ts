/**
 * NativeToolRegistry. Per CLAUDE.md §12:
 *
 *   ToolManager
 *   ├── NativeToolRegistry   ← this file
 *   └── MCPToolRegistry      ← packages/mcp
 *
 * The Agent Loop sees a uniform ToolDefinition surface either way.
 */

import type { ToolDefinition } from "./types";
import { readFileTool, listDirectoryTool, searchFilesTool } from "./native/fs-tools";
import { writeFileTool, editFileTool, deleteFileTool } from "./native/write-tools";
import {
  executeCommandTool,
  gitStatusTool,
  gitDiffTool,
  gitCommitTool,
} from "./native/exec-tools";

export function createNativeTools(): ToolDefinition[] {
  return [
    // READ_ONLY
    readFileTool,
    listDirectoryTool,
    searchFilesTool,
    gitStatusTool,
    gitDiffTool,
    // MODIFY / EXECUTE / DESTRUCTIVE
    writeFileTool,
    editFileTool,
    deleteFileTool,
    executeCommandTool,
    gitCommitTool,
  ];
}

export interface ToolRegistry {
  getAll(): Promise<ToolDefinition[]>;
}
