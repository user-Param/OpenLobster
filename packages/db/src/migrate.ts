/**
 * Programmatic migration runner.
 *
 * Usage: `npm run migrate` (runs through tsx).
 *
 * Reads DATABASE_URL from env. Applies any pending migrations from
 * ./migrations. Idempotent: tracks applied migrations in __drizzle_migrations.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  console.log("Connecting to Postgres...");
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  console.log("Running migrations from ./migrations ...");
  await migrate(db, { migrationsFolder: "./migrations" });

  console.log("Migrations complete.");
  await sql.end();
}

main().catch((err: unknown) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
