/**
 * drizzle-kit config. Used by `npm run generate` and `npm run push`.
 * The connection URL is read at runtime by drizzle-kit from DATABASE_URL
 * via dotenv (loaded automatically by drizzle-kit).
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://openlobster:openlobster@localhost:5432/openlobster",
  },
  verbose: true,
  strict: true,
});
