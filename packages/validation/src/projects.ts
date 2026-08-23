import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  description: z.string().max(2000).trim().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(120).trim().optional(),
    description: z.string().max(2000).trim().nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: "At least one field must be provided",
  });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
