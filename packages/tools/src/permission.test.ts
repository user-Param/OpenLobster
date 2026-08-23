import { describe, expect, it } from "vitest";
import { evaluatePermission } from "./permission";

const base = { toolName: "t", riskLevel: "read_only" } as const;

describe("evaluatePermission", () => {
  it("auto-allows read-only tools", () => {
    expect(evaluatePermission({ ...base, args: {} })).toEqual({
      decision: "ALLOW",
      reason: "read-only tool",
    });
  });

  it("requires approval for modify tools by default", () => {
    const d = evaluatePermission({ ...base, riskLevel: "modify", args: {} });
    expect(d.decision).toBe("REQUIRE_APPROVAL");
  });

  it("auto-approves modify when policy allows", () => {
    const d = evaluatePermission(
      { ...base, riskLevel: "modify", args: {} },
      { autoApproveModify: true },
    );
    expect(d.decision).toBe("ALLOW");
  });

  it("denies rm -rf even in permissive policies", () => {
    const d = evaluatePermission(
      {
        ...base,
        riskLevel: "execute",
        args: { command: "rm -rf / --no-preserve-root" },
      },
      { allowExecute: true },
    );
    expect(d.decision).toBe("DENY");
  });

  it("requires approval for git push", () => {
    const d = evaluatePermission({
      ...base,
      riskLevel: "execute",
      args: { command: "git push origin main" },
    });
    expect(d.decision).toBe("REQUIRE_APPROVAL");
  });

  it("allows ordinary sandboxed commands", () => {
    const d = evaluatePermission({
      ...base,
      riskLevel: "execute",
      args: { command: "npm test" },
    });
    expect(d.decision).toBe("ALLOW");
  });

  it("denies execute when workspace policy forbids it", () => {
    const d = evaluatePermission(
      { ...base, riskLevel: "execute", args: { command: "ls" } },
      { allowExecute: false },
    );
    expect(d.decision).toBe("DENY");
  });

  it("requires approval for destructive tools regardless of args", () => {
    const d = evaluatePermission({ ...base, riskLevel: "destructive", args: {} });
    expect(d.decision).toBe("REQUIRE_APPROVAL");
  });
});
