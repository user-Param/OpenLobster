/**
 * Fetch-based SSE subscriber for GET /v1/runs/:runId/events.
 *
 * EventSource cannot attach Authorization headers, so the stream is consumed
 * with fetch + ReadableStream and parsed manually. Supports:
 *   - Last-Event-ID replay on reconnect (header + `since` query fallback)
 *   - exponential backoff with jitter, honoring the server `retry:` hint
 *   - abort/cleanup via AbortSignal
 *   - dedupe by sequence (the server also guards, this is belt-and-braces)
 */

import type { AgentEventEnvelope } from "@/lib/api/types";

export interface SubscribeRunEventsOptions {
  path: string;
  getAccessToken: () => string | null;
  /** Resume after this sequence number (Last-Event-ID). */
  lastEventId: number;
  signal: AbortSignal;
  onEvent: (envelope: AgentEventEnvelope) => void;
  onStateChange?: (state: SseConnectionState) => void;
  /**
   * Return false to stop reconnecting (e.g. after a terminal run event or
   * when a permanent auth failure occurs).
   */
  shouldContinue?: () => boolean;
}

export type SseConnectionState = "connecting" | "live" | "reconnecting" | "stopped";

const MAX_BACKOFF_MS = 15_000;
const BASE_BACKOFF_MS = 800;
const MAX_RETRY_HINT_MS = 10_000;

interface RawSseEvent {
  id: string | null;
  data: string;
}

function parseStreamChunk(
  buffer: string,
): { events: RawSseEvent[]; rest: string; retryHint: number | null } {
  const events: RawSseEvent[] = [];
  let retryHint: number | null = null;

  // Normalize CRLF, then split on blank lines.
  const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";

  for (const block of blocks) {
    let id: string | null = null;
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue; // comment/keepalive
      if (line.startsWith("id:")) {
        id = line.slice(3).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      } else if (line.startsWith("retry:")) {
        const parsed = Number(line.slice(6).trim());
        if (Number.isFinite(parsed) && parsed > 0) retryHint = Math.min(parsed, MAX_RETRY_HINT_MS);
      }
      // `event:` lines are redundant — envelope.type carries the same value.
    }
    if (dataLines.length > 0) events.push({ id, data: dataLines.join("\n") });
  }

  return { events, rest, retryHint };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    if (signal.aborted) {
      clearTimeout(timer);
      resolve();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Subscribes to the run event stream. Resolves when the connection is
 * permanently stopped (aborted or shouldContinue returned false).
 */
export async function subscribeRunEvents(options: SubscribeRunEventsOptions): Promise<void> {
  const { signal } = options;
  let lastEventId = options.lastEventId;
  let attempt = 0;
  let retryHintMs: number | null = null;
  let state: SseConnectionState = "connecting";

  options.onStateChange?.(state);

  while (!signal.aborted && (options.shouldContinue?.() ?? true)) {
    try {
      const token = options.getAccessToken();
      const url = new URL(options.path, window.location.origin);
      // `since` complements Last-Event-ID replay on the backend.
      if (lastEventId >= 0) url.searchParams.set("since", String(lastEventId));

      const response = await fetch(url.toString(), {
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
          ...(lastEventId >= 0 ? { "Last-Event-ID": String(lastEventId) } : {}),
        },
        signal,
        cache: "no-store",
      });

      if (!response.ok || response.body === null) {
        // 401 etc.: do not hammer the server; surface once and stop.
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          options.onStateChange?.("stopped");
          return;
        }
        throw new Error(`event stream failed with status ${response.status}`);
      }

      state = "live";
      attempt = 0;
      options.onStateChange?.(state);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseStreamChunk(buffer);
        buffer = parsed.rest.endsWith("\n\n") ? "" : parsed.rest;
        if (parsed.retryHint !== null) retryHintMs = parsed.retryHint;

        for (const raw of parsed.events) {
          let envelope: AgentEventEnvelope;
          try {
            envelope = JSON.parse(raw.data) as AgentEventEnvelope;
          } catch {
            continue; // Malformed frame — skip rather than break the stream.
          }
          if (typeof envelope.sequence === "number" && envelope.sequence <= lastEventId) continue;
          if (typeof envelope.sequence === "number") lastEventId = envelope.sequence;
          else if (raw.id !== null && Number.isFinite(Number(raw.id))) lastEventId = Number(raw.id);
          options.onEvent(envelope);
        }
      }

      // Server closed the stream (run ended server-side).
      if (!(options.shouldContinue?.() ?? true)) break;
      state = "reconnecting";
      options.onStateChange?.(state);
    } catch (error) {
      if (signal.aborted) break;
      // Permanent failures already returned; anything here is transient.
      void error;
      if (!(options.shouldContinue?.() ?? true)) break;
      state = "reconnecting";
      options.onStateChange?.(state);
    }

    const backoff = retryHintMs ?? Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    attempt += 1;
    await sleep(backoff + Math.random() * 250, signal);
  }

  if (!signal.aborted) options.onStateChange?.("stopped");
}
