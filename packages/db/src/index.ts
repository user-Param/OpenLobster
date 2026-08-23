/**
 * Public surface of @openlobster/db.
 *
 * - schema:  all tables, relations, and column helpers
 * - createDb/getDb/closeDb: the postgres client factory
 * - migrate: programmatic migration runner
 */

export * from "./schema/index";
export { createDb, getDb, closeDb, schema } from "./client";
export type { Db, CreateDbOptions } from "./client";
