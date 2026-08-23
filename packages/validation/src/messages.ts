import { z } from "zod";
import { AGENT_MODES } from "@openlobster/types";

/**
 * The single most important request schema in the system: it is what the
 * client POSTs to start an agent run. See CLAUDE.md §9.
 *
 * Notes:
 *   - `mode` defaults to "coding" because that is the primary mode.
 *   - `model` is optional; when absent, the Model Gateway's router picks one.
 *   - We accept an idempotency key from the client so retries don't create
 *     duplicate runs (CLAUDE.md §5, Idempotency).
 */
export const createMessageSchema = z.object({
  content: z.string().min(1).max(200_000),
  mode: z.enum(AGENT_MODES).default("coding"),
  model: z.string().min(1).max(200).optional(),
  idempotencyKey: z.string().uuid().optional(),
});
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
