/**
 * Enums pulled directly from CLAUDE.md.
 * Keep these as union literal types (not TS enums) so they serialize cleanly
 * to JSON, are easy to match in switch statements, and don't bloat bundle size.
 *
 * If you find yourself needing runtime constants or iteration, define a
 * const tuple + derived type in this file. Do NOT introduce `enum`.
 */

// --- Membership roles ---

export type OrganizationRole = "owner" | "admin" | "member";
export const ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;

export type SessionMemberRole = "owner" | "editor" | "viewer";
export const SESSION_MEMBER_ROLES = ["owner", "editor", "viewer"] as const;

// --- Workspace ---

export type WorkspaceType = "local" | "remote" | "sandbox";
export const WORKSPACE_TYPES = ["local", "remote", "sandbox"] as const;

export type WorkspaceStatus = "active" | "inactive" | "provisioning" | "destroyed";
export const WORKSPACE_STATUSES = ["active", "inactive", "provisioning", "destroyed"] as const;

// --- Session ---

export type SessionVisibility = "private" | "shared";
export const SESSION_VISIBILITIES = ["private", "shared"] as const;

export type SessionStatus = "active" | "archived" | "deleted";
export const SESSION_STATUSES = ["active", "archived", "deleted"] as const;

// --- Message ---

export type MessageRole = "system" | "user" | "assistant" | "tool";
export const MESSAGE_ROLES = ["system", "user", "assistant", "tool"] as const;

// --- Agent ---

export type AgentMode = "planning" | "coding" | "reviewing" | "testing";
export const AGENT_MODES = ["planning", "coding", "reviewing", "testing"] as const;

/**
 * Agent run state machine. The order below is intentional — see CLAUDE.md §4.
 * A run moves through these states; transitions are validated at the DB layer
 * via a CHECK constraint and at the application layer via the run repository.
 */
export type RunStatus =
  | "queued"
  | "starting"
  | "running"
  | "waiting_tool"
  | "waiting_approval"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";
export const RUN_STATUSES = [
  "queued",
  "starting",
  "running",
  "waiting_tool",
  "waiting_approval",
  "paused",
  "completed",
  "failed",
  "cancelled",
  "timeout",
] as const;

export type RunTerminalStatus = "completed" | "failed" | "cancelled" | "timeout";
export const RUN_TERMINAL_STATUSES = ["completed", "failed", "cancelled", "timeout"] as const;

// --- Tool calls ---

export type ToolCallStatus = "pending" | "running" | "completed" | "failed" | "denied";
export const TOOL_CALL_STATUSES = ["pending", "running", "completed", "failed", "denied"] as const;

/**
 * Tool risk classification. The PermissionManager uses this to decide
 * whether a call needs user approval. See CLAUDE.md §6 (Permission/Approval).
 */
export type ToolRiskLevel = "read_only" | "modify" | "execute" | "destructive";
export const TOOL_RISK_LEVELS = ["read_only", "modify", "execute", "destructive"] as const;

// --- File changes ---

export type FileChangeOperation = "create" | "update" | "delete" | "rename";
export const FILE_CHANGE_OPERATIONS = ["create", "update", "delete", "rename"] as const;

// --- Permissions ---

export type PermissionGrant = "read" | "write" | "admin";
export const PERMISSION_GRANTS = ["read", "write", "admin"] as const;

// --- Events ---
//
// Event types are emitted by the worker and persisted to the `events` table.
// They drive the SSE stream consumed by Web/TUI. Add new types here when
// introducing new agent lifecycle moments.

export type AgentEventType =
  | "run.started"
  | "run.paused"
  | "run.resumed"
  | "run.completed"
  | "run.failed"
  | "run.cancelled"
  | "context.retrieval.started"
  | "context.retrieval.completed"
  | "llm.started"
  | "llm.completed"
  | "tool.requested"
  | "tool.started"
  | "tool.completed"
  | "file.created"
  | "file.modified"
  | "file.deleted"
  | "command.started"
  | "command.completed"
  | "test.started"
  | "test.passed"
  | "test.failed"
  | "approval.requested"
  | "approval.granted"
  | "approval.denied";
export const AGENT_EVENT_TYPES = [
  "run.started",
  "run.paused",
  "run.resumed",
  "run.completed",
  "run.failed",
  "run.cancelled",
  "context.retrieval.started",
  "context.retrieval.completed",
  "llm.started",
  "llm.completed",
  "tool.requested",
  "tool.started",
  "tool.completed",
  "file.created",
  "file.modified",
  "file.deleted",
  "command.started",
  "command.completed",
  "test.started",
  "test.passed",
  "test.failed",
  "approval.requested",
  "approval.granted",
  "approval.denied",
] as const;
