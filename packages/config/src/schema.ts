/**
 * Zod schema for the runtime environment.
 *
 * The contract:
 *   - Every required value MUST be present, or loadConfig() throws at startup.
 *   - Optional values get safe defaults.
 *   - Coercion is explicit: ports come in as strings from the shell, we coerce
 *     them to numbers. Durations come in as seconds, we expose them as numbers.
 *
 * Important: do NOT log the parsed config object — it contains secrets.
 * Use the `redactedSummary()` helper if you need to print what was loaded.
 */

import { z } from "zod";

const numericString = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer")
  .transform((s) => Number.parseInt(s, 10));

const optionalUrl = z
  .string()
  .url()
  .optional()
  .or(z.literal("").transform(() => undefined));

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // --- Database ---
  DATABASE_URL: z.string().url(),

  // --- Redis ---
  REDIS_URL: z.string().url().default("redis://localhost:6379"),

  // --- Vector DB ---
  CHROMA_URL: z.string().url().default("http://localhost:8000"),

  // --- Auth ---
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_TTL_SECONDS: numericString.default("3600"),
  JWT_REFRESH_TTL_SECONDS: numericString.default("2592000"),

  // --- Model providers (all optional; missing ones just disable that provider) ---
  OPENAI_API_KEY: z.string().optional().or(z.literal("").transform(() => undefined)),
  ANTHROPIC_API_KEY: z.string().optional().or(z.literal("").transform(() => undefined)),
  GEMINI_API_KEY: z.string().optional().or(z.literal("").transform(() => undefined)),
  DEEPSEEK_API_KEY: z.string().optional().or(z.literal("").transform(() => undefined)),

  // --- Sandbox (Phase 2; declared now so the schema is stable) ---
  SANDBOX_IMAGE: z.string().default("openlobster/sandbox:latest"),
  SANDBOX_CPU_LIMIT: numericString.default("2"),
  SANDBOX_MEMORY_LIMIT: z.string().default("2G"),
  SANDBOX_DISK_LIMIT: z.string().default("10G"),
  SANDBOX_TIMEOUT_SECONDS: numericString.default("600"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Public config surface exposed to consumers. Computed from `Env` to avoid
 * leaking raw env names everywhere.
 */
export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly isProduction: boolean;
  readonly database: { readonly url: string };
  readonly redis: { readonly url: string };
  readonly chroma: { readonly url: string };
  readonly auth: {
    readonly jwtSecret: string;
    readonly jwtRefreshSecret: string;
    readonly accessTtlSeconds: number;
    readonly refreshTtlSeconds: number;
  };
  readonly providers: {
    readonly openai: { readonly apiKey: string | undefined };
    readonly anthropic: { readonly apiKey: string | undefined };
    readonly gemini: { readonly apiKey: string | undefined };
    readonly deepseek: { readonly apiKey: string | undefined };
  };
  readonly sandbox: {
    readonly image: string;
    readonly cpuLimit: number;
    readonly memoryLimit: string;
    readonly diskLimit: string;
    readonly timeoutSeconds: number;
  };
}
