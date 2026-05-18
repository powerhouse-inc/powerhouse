import { Migrator, sql } from "kysely";
import type { Migration, MigrationProvider, Kysely } from "kysely";

import * as migration001 from "./001_create_attachment_table.js";
import * as migration002 from "./002_create_reservation_table.js";
import * as migration003 from "./003_add_reservation_expires_at.js";
import * as migration004 from "./004_add_reservation_soft_delete.js";
import * as migration005 from "./005_add_reservation_active_index.js";

export const ATTACHMENT_SCHEMA = "attachments";

export interface MigrationResult {
  success: boolean;
  migrationsExecuted: string[];
  error?: Error;
}

export interface MigrationLogger {
  warn(message: string, ...replacements: unknown[]): void;
}

const NOOP_MIGRATION: Migration = {
  async up() {},
  async down() {},
};

const migrations: Record<string, Migration> = {
  "001_create_attachment_table": migration001,
  "002_create_reservation_table": migration002,
  "003_add_reservation_expires_at": migration003,
  "004_add_reservation_soft_delete": migration004,
  "005_add_reservation_active_index": migration005,
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
  logger: MigrationLogger,
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
      `[reactor-attachments] Stubbing ${stubbed.length} recorded migration(s) not shipped by this version (likely a downgrade): ${stubbed.join(", ")}`,
    );
  }
  return entries;
}

export async function runAttachmentMigrations(
  db: Kysely<any>,
  schema: string = ATTACHMENT_SCHEMA,
  logger?: MigrationLogger,
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
