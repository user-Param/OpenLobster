/**
 * Loads process.env through the Zod schema, builds the AppConfig, and
 * returns it. Throws (with a clear, single error message) on validation
 * failure so misconfigured processes fail fast at startup.
 *
 * Side effects: loads .env via dotenv if a .env file exists in the cwd.
 * We do this at module load time so tests can stub process.env *before*
 * importing this module.
 */

import { config as loadDotenv } from "dotenv";
import { ZodError } from "zod";
import type { AppConfig, Env } from "./schema";
import { envSchema } from "./schema";

let loaded: AppConfig | null = null;

function loadEnv(): Env {
  // dotenv is a no-op if .env doesn't exist; it won't overwrite existing vars.
  loadDotenv({ quiet: true });

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const err = parsed.error as ZodError;
    const lines = err.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(
      `Invalid environment configuration. Fix the following and restart:\n${lines.join("\n")}`,
    );
  }
  return parsed.data;
}

export function buildConfig(env: Env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === "production",
    database: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
    chroma: { url: env.CHROMA_URL },
    auth: {
      jwtSecret: env.JWT_SECRET,
      jwtRefreshSecret: env.JWT_REFRESH_SECRET,
      accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
    },
    providers: {
      openai: { apiKey: env.OPENAI_API_KEY },
      anthropic: { apiKey: env.ANTHROPIC_API_KEY },
      gemini: { apiKey: env.GEMINI_API_KEY },
      deepseek: { apiKey: env.DEEPSEEK_API_KEY },
    },
    sandbox: {
      image: env.SANDBOX_IMAGE,
      cpuLimit: env.SANDBOX_CPU_LIMIT,
      memoryLimit: env.SANDBOX_MEMORY_LIMIT,
      diskLimit: env.SANDBOX_DISK_LIMIT,
      timeoutSeconds: env.SANDBOX_TIMEOUT_SECONDS,
    },
  };
}

/**
 * Returns the singleton AppConfig. The first call parses env; subsequent
 * calls return the cached value. Tests should use `resetConfig()` + direct
 * env mutation, or `buildConfig(loadEnv())` for one-off builds.
 */
export function getConfig(): AppConfig {
  if (loaded === null) {
    loaded = buildConfig(loadEnv());
  }
  return loaded;
}

/** Test helper: clears the cached config so the next getConfig() re-parses env. */
export function resetConfig(): void {
  loaded = null;
}

/**
 * Safe-to-log summary that omits secrets. Useful for startup banners.
 */
export function redactedSummary(cfg: AppConfig): string {
  const providers = Object.entries(cfg.providers)
    .filter(([, v]) => v.apiKey !== undefined)
    .map(([k]) => k)
    .join(",");
  return [
    `nodeEnv=${cfg.nodeEnv}`,
    `database=${redactUrl(cfg.database.url)}`,
    `redis=${redactUrl(cfg.redis.url)}`,
    `chroma=${cfg.chroma.url}`,
    `providers=${providers || "(none)"}`,
    `sandbox.image=${cfg.sandbox.image}`,
  ].join(" ");
}

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "<invalid-url>";
  }
}
