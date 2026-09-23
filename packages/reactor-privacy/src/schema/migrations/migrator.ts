import type { Kysely, MigrationProvider } from "kysely";
import { Migrator, sql } from "kysely";
import * as migration0001 from "./0001_subject_documents.js";
import * as migration0002 from "./0002_privacy_audit_log.js";

const migrations = {
  "0001_subject_documents": migration0001,
  "0002_privacy_audit_log": migration0002,
};

const REACTOR_PRIVACY_MIGRATION_TABLE = "kysely_migration_reactor_privacy";
const REACTOR_PRIVACY_MIGRATION_LOCK_TABLE =
  "kysely_migration_reactor_privacy_lock";

export interface ReactorPrivacyMigrationResult {
  success: boolean;
  migrationsExecuted: string[];
  error?: Error;
}

class ProgrammaticMigrationProvider implements MigrationProvider {
  getMigrations() {
    return Promise.resolve(migrations);
  }
}

export async function runReactorPrivacyMigrations(
  db: Kysely<unknown>,
  schema: string,
): Promise<ReactorPrivacyMigrationResult> {
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
    migrationTableName: REACTOR_PRIVACY_MIGRATION_TABLE,
    migrationLockTableName: REACTOR_PRIVACY_MIGRATION_LOCK_TABLE,
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

  return { success: true, migrationsExecuted };
}
