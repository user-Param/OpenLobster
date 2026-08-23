import { z } from "zod";
import { AGENT_EVENT_TYPES } from "@openlobster/types";

/**
 * Schema for the persisted `events` row payload. The `type` is one of
 * AGENT_EVENT_TYPES; `payload` is open-ended (per-event-type shapes live
 * in `packages/events` once that slice lands).
 */
export const agentEventSchema = z.object({
  type: z.enum(AGENT_EVENT_TYPES),
  sequence: z.number().int().nonnegative(),
  payload: z.record(z.unknown()),
});
export type AgentEventInput = z.infer<typeof agentEventSchema>;
