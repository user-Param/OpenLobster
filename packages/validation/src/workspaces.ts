import { z } from "zod";
import { WORKSPACE_TYPES } from "@openlobster/types";

export const createWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(120).trim(),
    type: z.enum(WORKSPACE_TYPES),
    // For type="local", rootPath is required.
    rootPath: z.string().min(1).optional(),
    // For type="remote" | "sandbox", repositoryUrl is required.
    repositoryUrl: z.string().url().optional(),
    branch: z.string().min(1).max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "local" && !v.rootPath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rootPath"],
        message: "rootPath is required for local workspaces",
      });
    }
    if ((v.type === "remote" || v.type === "sandbox") && !v.repositoryUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repositoryUrl"],
        message: "repositoryUrl is required for remote/sandbox workspaces",
      });
    }
  });
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(120).trim().optional(),
    branch: z.string().min(1).max(200).optional(),
    status: z.enum(["active", "inactive", "provisioning", "destroyed"]).optional(),
  })
  .refine((v) => v.name !== undefined || v.branch !== undefined || v.status !== undefined, {
    message: "At least one field must be provided",
  });
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
