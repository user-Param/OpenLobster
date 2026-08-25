/**
 * Typed endpoint functions. One function per backend route, transcribed from
 * apps/api/src/routes/*. Request/response shapes come verbatim from those
 * implementations and @openlobster/validation schemas.
 */

import { api } from "./client";
import type {
  AgentMode,
  AuthResponse,
  CreateMessageResult,
  CurrentUserResponse,
  MessagePage,
  ModelDescriptor,
  Project,
  ProjectSummary,
  RunDetail,
  RunDiff,
  RunSignalResult,
  Session,
  SessionVisibility,
  TokenPair,
  UsageSummary,
  Workspace,
} from "./types";

// --- Auth (public routes; no auth-retry interceptor) -------------------------

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
}

export function signUp(input: SignUpInput): Promise<AuthResponse> {
  return api<AuthResponse>("/auth/signup", { method: "POST", body: input, skipAuthRetry: true });
}

export function signIn(input: { email: string; password: string }): Promise<AuthResponse> {
  return api<AuthResponse>("/auth/login", { method: "POST", body: input, skipAuthRetry: true });
}

export function refreshTokens(refreshToken: string): Promise<TokenPair> {
  return api<TokenPair>(
    "/auth/refresh",
    { method: "POST", body: { refreshToken }, skipAuthRetry: true },
  );
}

export function logout(refreshToken: string): Promise<void> {
  return api<void>("/auth/logout", { method: "POST", body: { refreshToken }, skipAuthRetry: true });
}

// --- Users / models / usage ----------------------------------------------------

export function fetchCurrentUser(): Promise<CurrentUserResponse> {
  return api<CurrentUserResponse>("/users/me");
}

export function fetchModels(): Promise<{ models: ModelDescriptor[] }> {
  return api<{ models: ModelDescriptor[] }>("/models");
}

export function fetchUsage(): Promise<UsageSummary> {
  return api<UsageSummary>("/usage");
}

// --- Projects ---------------------------------------------------------------------

export function listProjects(): Promise<{ projects: ProjectSummary[] }> {
  return api<{ projects: ProjectSummary[] }>("/projects");
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export function createProject(input: CreateProjectInput): Promise<{ id: string; name: string }> {
  return api<{ id: string; name: string }>("/projects", { method: "POST", body: input });
}

export function getProject(projectId: string): Promise<Project> {
  return api<Project>(`/projects/${projectId}`);
}

export function deleteProject(projectId: string): Promise<void> {
  return api<void>(`/projects/${projectId}`, { method: "DELETE" });
}

// --- Workspaces ----------------------------------------------------------------------

export function listWorkspaces(projectId: string): Promise<{ workspaces: Workspace[] }> {
  return api<{ workspaces: Workspace[] }>(`/project/${projectId}/workspaces`);
}

export interface CreateWorkspaceInput {
  name: string;
  type: "local" | "remote" | "sandbox";
  rootPath?: string;
  repositoryUrl?: string;
  branch?: string;
}

export function createWorkspace(projectId: string, input: CreateWorkspaceInput): Promise<Workspace> {
  return api<Workspace>(`/project/${projectId}/workspaces`, { method: "POST", body: input });
}

export function deleteWorkspace(workspaceId: string): Promise<void> {
  return api<void>(`/workspaces/${workspaceId}`, { method: "DELETE" });
}

// --- Sessions ---------------------------------------------------------------------------

export interface ListSessionsResult {
  sessions: Session[];
  page: number;
  limit: number;
}

export function listSessions(projectId: string, page = 1, limit = 50): Promise<ListSessionsResult> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return api<ListSessionsResult>(`/project/${projectId}/sessions?${params.toString()}`);
}

export interface CreateSessionInput {
  workspaceId: string;
  name: string;
  visibility: SessionVisibility;
}

export function createSession(projectId: string, input: CreateSessionInput): Promise<Session> {
  return api<Session>(`/project/${projectId}/sessions`, { method: "POST", body: input });
}

export function getSession(sessionId: string): Promise<Session> {
  return api<Session>(`/sessions/${sessionId}`);
}

export function renameSession(sessionId: string, name: string): Promise<void> {
  return api<void>(`/sessions/${sessionId}`, { method: "PATCH", body: { name } });
}

export function archiveSession(sessionId: string): Promise<void> {
  return api<void>(`/sessions/${sessionId}`, { method: "DELETE" });
}

// --- Messages ------------------------------------------------------------------------------

export interface SendMessageInput {
  content: string;
  mode: AgentMode;
  model?: string;
  idempotencyKey: string;
}

/** Starts an agent run; returns 202 with the queued run coordinates. */
export function sendMessage(sessionId: string, input: SendMessageInput): Promise<CreateMessageResult> {
  return api<CreateMessageResult>(`/sessions/${sessionId}/messages`, {
    method: "POST",
    body: {
      content: input.content,
      mode: input.mode,
      ...(input.model !== undefined && input.model.length > 0 ? { model: input.model } : {}),
      idempotencyKey: input.idempotencyKey,
    },
    idempotencyKey: input.idempotencyKey,
  });
}

export function listMessages(
  sessionId: string,
  options: { cursor?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<MessagePage> {
  const params = new URLSearchParams();
  if (options.cursor !== undefined) params.set("cursor", options.cursor);
  params.set("limit", String(options.limit ?? 100));
  return api<MessagePage>(`/sessions/${sessionId}/messages?${params.toString()}`, {
    signal: options.signal,
  });
}

// --- Runs -------------------------------------------------------------------------------------

export function fetchRun(runId: string, signal?: AbortSignal): Promise<RunDetail> {
  return api<RunDetail>(`/runs/${runId}`, { signal });
}

export function cancelRun(runId: string): Promise<RunSignalResult> {
  return api<RunSignalResult>(`/runs/${runId}/cancel`, { method: "POST" });
}

export function pauseRun(runId: string): Promise<RunSignalResult> {
  return api<RunSignalResult>(`/runs/${runId}/pause`, { method: "POST" });
}

export function resumeRun(runId: string): Promise<RunSignalResult> {
  return api<RunSignalResult>(`/runs/${runId}/resume`, { method: "POST" });
}

export function fetchRunDiff(runId: string, signal?: AbortSignal): Promise<RunDiff> {
  return api<RunDiff>(`/runs/${runId}/diff`, { signal });
}

/** SSE endpoint path (relative; consumed through the same rewrite proxy). */
export function runEventsPath(runId: string): string {
  return `/api/v1/runs/${runId}/events`;
}
