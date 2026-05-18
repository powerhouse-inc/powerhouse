import { Migrator, sql } from "kysely";
import type { Migration, MigrationProvider, Kysely } from "kysely";
import type { ILogger } from "document-model";
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
import * as migration011 from "./011_add_cursor_type_column.js";
import * as migration012 from "./012_add_source_remote_column.js";
import * as migration013 from "./013_create_sync_dead_letters_table.js";
import * as migration014 from "./014_create_processor_cursor_table.js";

const NOOP_MIGRATION: Migration = {
  async up() {},
  async down() {},
};

const migrations: Record<string, Migration> = {
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
  "011_add_cursor_type_column": migration011,
  "012_add_source_remote_column": migration012,
  "013_create_sync_dead_letters_table": migration013,
  "014_create_processor_cursor_table": migration014,
};

class ProgrammaticMigrationProvider implements MigrationProvider {
  constructor(private readonly entries: Record<string, Migration>) {}
  getMigrations() {
    return Promise.resolve(this.entries);
  }
}

async function readExecutedMigrationNames(
  db: Kysely<any>,
  schema: string,
): Promise<string[]> {
  try {
    const result = await sql<{ name: string }>`
      SELECT name FROM ${sql.id(schema)}.kysely_migration
    `.execute(db);
    return result.rows.map((row) => row.name);
  } catch {
    return [];
  }
}

// Stub out recorded names we no longer ship so a downgrade doesn't trip Kysely's missing-migration guard.
async function buildMigrationSet(
  db: Kysely<any>,
  schema: string,
  logger: Pick<ILogger, "warn">,
): Promise<Record<string, Migration>> {
  const executedNames = await readExecutedMigrationNames(db, schema);
  const entries: Record<string, Migration> = { ...migrations };
  const stubbed: string[] = [];
  for (const name of executedNames) {
    if (!(name in entries)) {
      entries[name] = NOOP_MIGRATION;
      stubbed.push(name);
    }
  }
  if (stubbed.length > 0) {
    logger.warn(
      `[reactor] Stubbing ${stubbed.length} recorded migration(s) not shipped by this version (likely a downgrade): ${stubbed.join(", ")}`,
    );
  }
  return entries;
}

export async function runMigrations(
  db: Kysely<any>,
  schema: string = REACTOR_SCHEMA,
  logger?: Pick<ILogger, "warn">,
): Promise<MigrationResult> {
  const log = logger ?? console;
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

  const scopedDb = db.withSchema(schema);
  const entries = await buildMigrationSet(scopedDb, schema, log);

  const migrator = new Migrator({
    db: scopedDb,
    provider: new ProgrammaticMigrationProvider(entries),
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
  const scopedDb = db.withSchema(schema);
  const entries = await buildMigrationSet(scopedDb, schema, console);
  const migrator = new Migrator({
    db: scopedDb,
    provider: new ProgrammaticMigrationProvider(entries),
    migrationTableSchema: schema,
  });

  return await migrator.getMigrations();
}
