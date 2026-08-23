import type { Logger as PinoLogger } from "pino";

export { getLogger, withContext, resetLogger } from "./logger";
export type { LogLevel, LogContext } from "./logger";
/** Re-export the underlying pino logger type so consumers can declare logger-typed locals. */
export type Logger = PinoLogger;
export { REDACT_PATHS } from "./redact";
