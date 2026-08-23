/**
 * Logger factory.
 *
 * Two surfaces:
 *   - getLogger(component): a root-scoped logger for a process or service.
 *   - withContext({ runId, sessionId, userId, ... }): a child logger with
 *     those fields attached to every line. This is the primary API for
 *     agent execution: when the Harness spawns a run, every log line for
 *     that run carries runId automatically.
 *
 * Format:
 *   - development: pretty, colorized, single-line.
 *   - test/production: JSON, one line per record, ready for log aggregators.
 */

import { pino, type Logger, type LoggerOptions } from "pino";
import { REDACT_PATHS, REDACT_REMOVE } from "./redact";

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface LogContext {
  readonly userId?: string;
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly taskId?: string;
  readonly runId?: string;
  readonly workerId?: string;
  readonly requestId?: string;
}

interface CreateLoggerOptions {
  readonly level?: LogLevel;
  readonly isProduction: boolean;
  readonly component: string;
}

function buildOptions(opts: CreateLoggerOptions): LoggerOptions {
  const base: LoggerOptions = {
    level: opts.level ?? (opts.isProduction ? "info" : "debug"),
    base: {
      component: opts.component,
      pid: process.pid,
      nodeEnv: opts.isProduction ? "production" : "development",
    },
    redact: {
      paths: REDACT_PATHS,
      remove: REDACT_REMOVE,
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (opts.isProduction) {
    return base;
  }

  // Development: route through pino-pretty for human-readable output.
  return {
    ...base,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname,component,nodeEnv",
        singleLine: false,
      },
    },
  };
}

let rootLogger: Logger | null = null;

/**
 * Returns the singleton root logger. The first call captures `isProduction`
 * from the env (or you can pass it explicitly); subsequent calls reuse it.
 */
export function getLogger(component: string, isProduction = process.env["NODE_ENV"] === "production"): Logger {
  if (rootLogger === null) {
    rootLogger = pino(buildOptions({ component, isProduction }));
  }
  return rootLogger;
}

/**
 * Create a child logger with bound context. Use this everywhere inside
 * the Agent Harness and Worker — every log line will carry runId, sessionId,
 * etc. for free.
 */
export function withContext(parent: Logger, ctx: LogContext): Logger {
  // Filter out undefined so they don't appear in the JSON output as `"key": null`.
  const bindings: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === "string" && v.length > 0) {
      bindings[k] = v;
    }
  }
  return parent.child(bindings);
}

/**
 * Test helper: drop the cached root logger so the next getLogger() rebuilds
 * it (e.g. with a different level or component).
 */
export function resetLogger(): void {
  rootLogger = null;
}
