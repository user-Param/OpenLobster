/**
 * Branded ID types.
 *
 * IDs are strings at runtime, but we brand them at the type level so a UserId
 * can never accidentally be passed where a SessionId is expected.
 *
 * Prefix convention (matches CLAUDE.md):
 *   usr_  org_  prj_  ws_   ses_  msg_  task_  run_  tc_  tr_  fc_  cp_  ur_  perm_ aud_ evt_
 */
declare const __brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type UserId = Brand<string, "UserId">;
export type OrganizationId = Brand<string, "OrganizationId">;
export type ProjectId = Brand<string, "ProjectId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type SessionId = Brand<string, "SessionId">;
export type MessageId = Brand<string, "MessageId">;
export type TaskId = Brand<string, "TaskId">;
export type RunId = Brand<string, "RunId">;
export type CheckpointId = Brand<string, "CheckpointId">;
export type ToolCallId = Brand<string, "ToolCallId">;
export type ToolResultId = Brand<string, "ToolResultId">;
export type FileChangeId = Brand<string, "FileChangeId">;
export type UsageRecordId = Brand<string, "UsageRecordId">;
export type PermissionId = Brand<string, "PermissionId">;
export type AuditLogId = Brand<string, "AuditLogId">;
export type EventId = Brand<string, "EventId">;

/**
 * Helper for code that needs to construct a branded ID from a raw string
 * (e.g. when reading from the DB row). NEVER use this at API boundaries —
 * validate the raw string there.
 */
export const asId = <T extends Brand<string, string>>(s: string): T => s as T;
