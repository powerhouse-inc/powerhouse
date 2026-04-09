import { Migrator, sql } from "kysely";
import type { MigrationProvider, Kysely } from "kysely";

import * as migration001 from "./001_create_attachment_table.js";

export const ATTACHMENT_SCHEMA = "attachments";

export interface MigrationResult {
  success: boolean;
  migrationsExecuted: string[];
  error?: Error;
}

const migrations = {
  "001_create_attachment_table": migration001,
};

class ProgrammaticMigrationProvider implements MigrationProvider {
  getMigrations() {
    return Promise.resolve(migrations);
  }
}

export async function runAttachmentMigrations(
  db: Kysely<any>,
  schema: string = ATTACHMENT_SCHEMA,
): Promise<MigrationResult> {
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS ${sql.id(schema)}`.execute(db);
  } catch (error) {
    return {
      success: false,
      migrationsExecuted: [],
      error:
        error instanceof Error ? error : new Error("Failed to create schema"),
    };
  }

  const migrator = new Migrator({
    db: db.withSchema(schema),
    provider: new ProgrammaticMigrationProvider(),
    migrationTableSchema: schema,
  });

  let error: unknown;
  let results: Awaited<ReturnType<typeof migrator.migrateToLatest>>["results"];
  try {
    const result = await migrator.migrateToLatest();
    error = result.error;
    results = result.results;
  } catch (e) {
    error = e;
    results = [];
  }

  const migrationsExecuted =
    results?.map((result) => result.migrationName) ?? [];

  if (error) {
    return {
      success: false,
      migrationsExecuted,
      error:
        error instanceof Error ? error : new Error("Unknown migration error"),
    };
  }

  return {
    success: true,
    migrationsExecuted,
  };
}
