/**
 * Pino redaction paths for anything that smells like a secret.
 *
 * CLAUDE.md §10 (Secrets management) says secrets must never appear in logs.
 * We apply redaction both at field name (catches accidental logging of
 * `{ apiKey: "..." }`) and at value pattern (catches accidental logging of
 * JWT tokens, bearer tokens, etc. wherever they appear).
 *
 * Add new field names here, not at individual call sites.
 */

export const REDACT_PATHS = [
  // Authorization / session
  "*.password",
  "*.passwordHash",
  "*.secret",
  "*.apiKey",
  "*.api_key",
  "*.token",
  "*.refreshToken",
  "*.accessToken",
  "*.authorization",
  "*.cookie",
  "*.setCookie",
  "*.headers.authorization",
  "*.headers.cookie",
  // Standard env / config surfaces
  "config.auth.jwtSecret",
  "config.auth.jwtRefreshSecret",
  "config.providers.*.apiKey",
  // Common LLM SDK response shapes
  "*.choices[*].message.function_call.arguments",
];

export const REDACT_REMOVE = false; // false => replace with "[REDACTED]"
