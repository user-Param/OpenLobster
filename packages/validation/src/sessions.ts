import { z } from "zod";
import { SESSION_VISIBILITIES } from "@openlobster/types";

export const createSessionSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200).trim(),
  visibility: z.enum(SESSION_VISIBILITIES).default("private"),
});
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const updateSessionSchema = z
  .object({
    name: z.string().min(1).max(200).trim().optional(),
  })
  .refine((v) => v.name !== undefined, { message: "name must be provided" });
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
