import { Migrator, sql } from "kysely";
import type { Kysely, MigrationProvider } from "kysely";
import * as migration001 from "./001_create_attachment_reference_table.js";

export const ATTACHMENT_REFERENCE_SCHEMA = "attachment_reference_read_model";
export const ATTACHMENT_REFERENCE_MIGRATION_TABLE =
  "kysely_migration_attachment_reference_read_model";
export const ATTACHMENT_REFERENCE_MIGRATION_LOCK_TABLE =
  "kysely_migration_attachment_reference_read_model_lock";

export interface AttachmentReferenceMigrationResult {
  success: boolean;
  migrationsExecuted: string[];
  error?: Error;
}

const migrations = {
  "001_create_attachment_reference_table": migration001,
};

class ProgrammaticMigrationProvider implements MigrationProvider {
  getMigrations() {
    return Promise.resolve(migrations);
  }
}

function createMigrator(db: Kysely<unknown>, schema: string): Migrator {
  return new Migrator({
    db: db.withSchema(schema),
    provider: new ProgrammaticMigrationProvider(),
    migrationTableSchema: schema,
    migrationTableName: ATTACHMENT_REFERENCE_MIGRATION_TABLE,
    migrationLockTableName: ATTACHMENT_REFERENCE_MIGRATION_LOCK_TABLE,
  });
}

function toResult(
  error: unknown,
  results:
    | Awaited<ReturnType<Migrator["migrateToLatest"]>>["results"]
    | undefined,
): AttachmentReferenceMigrationResult {
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

export async function runAttachmentReferenceMigrations(
  db: Kysely<unknown>,
  schema: string = ATTACHMENT_REFERENCE_SCHEMA,
): Promise<AttachmentReferenceMigrationResult> {
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

  try {
    const { error, results } = await createMigrator(
      db,
      schema,
    ).migrateToLatest();
    return toResult(error, results);
  } catch (error) {
    return toResult(error, []);
  }
}

export async function rollbackAttachmentReferenceMigration(
  db: Kysely<unknown>,
  schema: string = ATTACHMENT_REFERENCE_SCHEMA,
): Promise<AttachmentReferenceMigrationResult> {
  try {
    const { error, results } = await createMigrator(db, schema).migrateDown();
    return toResult(error, results);
  } catch (error) {
    return toResult(error, []);
  }
}

export async function getAttachmentReferenceMigrationStatus(
  db: Kysely<unknown>,
  schema: string = ATTACHMENT_REFERENCE_SCHEMA,
) {
  return await createMigrator(db, schema).getMigrations();
}
