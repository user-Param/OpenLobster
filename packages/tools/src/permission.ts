/**
 * Permission policy engine. Per CLAUDE.md §2 (Tool permission/approval) and
 * the risk-level table:
 *
 *   READ_ONLY   → automatically allowed
 *   MODIFY      → allowed according to workspace policy
 *   EXECUTE     → sandbox + policy
 *   DESTRUCTIVE → explicit user approval
 *
 * This module is PURE (no I/O) so it is trivially unit-testable.
 */

import type { ToolRiskLevel } from "@openlobster/types";
import type { PermissionDecision } from "./types";

export interface PolicyInput {
  readonly toolName: string;
  readonly riskLevel: ToolRiskLevel;
  /** Normalized arguments object for pattern checks. */
  readonly args: Record<string, unknown>;
}

/**
 * Hard deny patterns for shell commands. Matched case-insensitively against
 * the command string. These are belt-and-braces on top of sandboxing —
 * defense in depth, not the only line.
 */
const DENY_PATTERNS: readonly RegExp[] = [
  /rm\s+(-[a-z]*\s+)*-?[rf]{2,}/i, // rm -rf and friends
  /mkfs(\.\w+)?/i,
  /dd\s+if=/i,
  /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, // fork bomb
  /shutdown|reboot|halt\b/i,
  /git\s+push\s+.*--force/i,
  /git\s+reset\s+--hard/i,
  /drop\s+(table|database)/i,
  /truncate\s+table/i,
  />\s*\/dev\/sd[a-z]/i,
];

/** Patterns that always require human approval even in permissive modes. */
const APPROVAL_PATTERNS: readonly RegExp[] = [
  /git\s+push/i,
  /npm\s+publish/i,
  /curl\b[^\n|;&]*\|\s*(ba)?sh/i, // curl | sh
  /chmod\s+777/i,
  /docker\s+(run|exec)/i,
];

export interface WorkspacePolicy {
  /** auto-approve modify tools without asking. Default false. */
  readonly autoApproveModify?: boolean;
  /** allow execute-class commands that pass deny/approval patterns. Default true. */
  readonly allowExecute?: boolean;
}

const DEFAULT_POLICY: WorkspacePolicy = {
  autoApproveModify: false,
  allowExecute: true,
};

export function evaluatePermission(input: PolicyInput, policy: WorkspacePolicy = DEFAULT_POLICY): PermissionDecision {
  // 1) Shell-content checks first — they override everything else.
  const command = typeof input.args["command"] === "string" ? (input.args["command"] as string) : null;
  if (command !== null) {
    for (const re of DENY_PATTERNS) {
      if (re.test(command)) {
        return { decision: "DENY", reason: `command matches denied pattern: ${re.source}` };
      }
    }
    for (const re of APPROVAL_PATTERNS) {
      if (re.test(command)) {
        return { decision: "REQUIRE_APPROVAL", reason: `command requires approval: ${re.source}` };
      }
    }
  }

  // 2) Risk-level routing.
  switch (input.riskLevel) {
    case "read_only":
      return { decision: "ALLOW", reason: "read-only tool" };
    case "modify":
      return policy.autoApproveModify === true
        ? { decision: "ALLOW", reason: "workspace policy auto-approves modify" }
        : { decision: "REQUIRE_APPROVAL", reason: "modifying tool" };
    case "execute":
      if (policy.allowExecute === false) {
        return { decision: "DENY", reason: "workspace policy forbids command execution" };
      }
      return { decision: "ALLOW", reason: "execute inside sandbox" };
    case "destructive":
      return { decision: "REQUIRE_APPROVAL", reason: "destructive operation" };
  }
}
