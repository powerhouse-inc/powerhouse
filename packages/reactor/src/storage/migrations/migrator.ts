import { Migrator, sql } from "kysely";
import type { MigrationProvider, Kysely } from "kysely";
import type { MigrationResult } from "./types.js";

export const REACTOR_SCHEMA = "reactor";
import * as migration001 from "./001_create_operation_table.js";
import * as migration002 from "./002_create_keyframe_table.js";
import * as migration003 from "./003_create_document_table.js";
import * as migration004 from "./004_create_document_relationship_table.js";
import * as migration005 from "./005_create_indexer_state_table.js";
import * as migration006 from "./006_create_document_snapshot_table.js";
import * as migration007 from "./007_create_slug_mapping_table.js";
import * as migration008 from "./008_create_view_state_table.js";
import * as migration009 from "./009_create_operation_index_tables.js";
import * as migration010 from "./010_create_sync_tables.js";

const migrations = {
  "001_create_operation_table": migration001,
  "002_create_keyframe_table": migration002,
  "003_create_document_table": migration003,
  "004_create_document_relationship_table": migration004,
  "005_create_indexer_state_table": migration005,
  "006_create_document_snapshot_table": migration006,
  "007_create_slug_mapping_table": migration007,
  "008_create_view_state_table": migration008,
  "009_create_operation_index_tables": migration009,
  "010_create_sync_tables": migration010,
};

class ProgrammaticMigrationProvider implements MigrationProvider {
  getMigrations() {
    return Promise.resolve(migrations);
  }
}

export async function runMigrations(
  db: Kysely<any>,
  schema: string = REACTOR_SCHEMA,
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

export async function getMigrationStatus(
  db: Kysely<any>,
  schema: string = REACTOR_SCHEMA,
) {
  const migrator = new Migrator({
    db: db.withSchema(schema),
    provider: new ProgrammaticMigrationProvider(),
    migrationTableSchema: schema,
  });

  return await migrator.getMigrations();
}
