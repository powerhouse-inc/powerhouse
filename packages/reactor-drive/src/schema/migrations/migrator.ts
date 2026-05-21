import type { Kysely, MigrationProvider } from "kysely";
import { Migrator, sql } from "kysely";
import * as migration0001 from "./0001_drive_node.js";
import * as migration0002 from "./0002_document_name.js";

const migrations = {
  "0001_drive_node": migration0001,
  "0002_document_name": migration0002,
};

const REACTOR_DRIVE_MIGRATION_TABLE = "kysely_migration_reactor_drive";
const REACTOR_DRIVE_MIGRATION_LOCK_TABLE =
  "kysely_migration_reactor_drive_lock";

export interface ReactorDriveMigrationResult {
  success: boolean;
  migrationsExecuted: string[];
  error?: Error;
}

class ProgrammaticMigrationProvider implements MigrationProvider {
  getMigrations() {
    return Promise.resolve(migrations);
  }
}

export async function runReactorDriveMigrations(
  db: Kysely<unknown>,
  schema: string,
): Promise<ReactorDriveMigrationResult> {
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
    migrationTableName: REACTOR_DRIVE_MIGRATION_TABLE,
    migrationLockTableName: REACTOR_DRIVE_MIGRATION_LOCK_TABLE,
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

export async function getReactorDriveMigrationStatus(
  db: Kysely<unknown>,
  schema: string,
) {
  const migrator = new Migrator({
    db: db.withSchema(schema),
    provider: new ProgrammaticMigrationProvider(),
    migrationTableSchema: schema,
    migrationTableName: REACTOR_DRIVE_MIGRATION_TABLE,
    migrationLockTableName: REACTOR_DRIVE_MIGRATION_LOCK_TABLE,
  });

  return await migrator.getMigrations();
}
