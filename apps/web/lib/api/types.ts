/**
 * Frontend mirrors of the OpenLobster REST API contracts.
 *
 * Every shape here is transcribed from the existing backend implementation
 * (apps/api/src/routes/*) — nothing is invented. If the backend changes,
 * update these types to match; never widen them speculatively.
 */

// --- Shared enums (mirrors @openlobster/types) -------------------------------

export type AgentMode = "planning" | "coding" | "reviewing" | "testing";
export const AGENT_MODES: readonly AgentMode[] = ["planning", "coding", "reviewing", "testing"];

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
export const RUN_TERMINAL_STATUSES: readonly RunStatus[] = [
  "completed",
  "failed",
  "cancelled",
  "timeout",
];

export type SessionVisibility = "private" | "shared";
export type WorkspaceType = "local" | "remote" | "sandbox";

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

// --- Auth --------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

/** Returned by signup/login (and refresh, without `user`). */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse extends TokenPair {
  user: AuthUser;
}

// --- Users / models / usage ----------------------------------------------------

export interface CurrentUserResponse {
  user: AuthUser & { avatarUrl: string | null };
  organizationId: string;
  role: string;
}

export type ModelCapability =
  | "tool_calling"
  | "vision"
  | "streaming"
  | "structured_output"
  | "reasoning"
  | "embedding";

export interface ModelDescriptor {
  id: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  capabilities: ModelCapability[];
  type: "cloud";
}

export interface UsageSummary {
  period: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  runs: number;
}

// --- Projects / workspaces -----------------------------------------------------

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  role: string;
}

export interface Project {
  id: string;
  organizationId: string;
  createdBy: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Workspace {
  id: string;
  projectId: string;
  name: string;
  type: WorkspaceType;
  status: "active" | "inactive" | "provisioning" | "destroyed";
  repositoryUrl: string | null;
  branch: string | null;
  rootPath: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Sessions / messages --------------------------------------------------------

export interface Session {
  id: string;
  projectId: string;
  workspaceId: string;
  createdBy: string;
  name: string;
  visibility: SessionVisibility;
  status: "active" | "archived" | "deleted";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  runId: string | null;
  createdAt: string;
}

export interface MessagePage {
  messages: ChatMessage[];
  nextCursor: string | null;
}

/** 202 response for POST /v1/sessions/:sessionId/messages. */
export interface CreateMessageResult {
  runId: string;
  taskId: string;
  messageId: string;
  status: "queued";
}

// --- Runs -------------------------------------------------------------------------

export interface RunDetail {
  id: string;
  taskId: string;
  status: RunStatus;
  attempt: number;
  model: string | null;
  provider: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
}

export interface RunSignalResult {
  status: "cancelling" | "pausing" | "resuming";
}

export interface DiffFile {
  path: string;
  operation: "create" | "update" | "delete" | "rename";
  additions: number;
  deletions: number;
  diff: string;
}

export interface RunDiff {
  files: DiffFile[];
  totals: { additions: number; deletions: number };
}

/** Envelope written by GET /v1/runs/:runId/events (SSE data payload). */
export interface AgentEventEnvelope {
  id: string;
  runId: string;
  sessionId: string;
  type: AgentEventType;
  sequence: number;
  payload: Record<string, unknown>;
  createdAt: string;
}
