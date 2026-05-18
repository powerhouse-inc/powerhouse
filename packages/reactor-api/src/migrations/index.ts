import {
  Migrator,
  sql,
  type Kysely,
  type Migration,
  type MigrationProvider,
} from "kysely";
import type { ILogger } from "document-model";
import * as migration001 from "./001_create_document_permissions.js";
import * as migration002 from "./002_add_document_protection.js";

const NOOP_MIGRATION: Migration = {
  async up() {},
  async down() {},
};

const migrations: Record<string, Migration> = {
  "001_create_document_permissions": migration001,
  "002_add_document_protection": migration002,
};

class StaticMigrationProvider implements MigrationProvider {
  constructor(private readonly entries: Record<string, Migration>) {}
  getMigrations() {
    return Promise.resolve(this.entries);
  }
}

async function readExecutedMigrationNames(
  db: Kysely<unknown>,
): Promise<string[]> {
  try {
    const result = await sql<{ name: string }>`
      SELECT name FROM kysely_migration
    `.execute(db);
    return result.rows.map((row) => row.name);
  } catch {
    return [];
  }
}

// Stub out recorded names we no longer ship so a downgrade doesn't trip Kysely's missing-migration guard.
async function buildMigrationSet(
  db: Kysely<unknown>,
  logger: Pick<ILogger, "warn">,
): Promise<Record<string, Migration>> {
  const executedNames = await readExecutedMigrationNames(db);
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
      `[reactor-api] Stubbing ${stubbed.length} recorded migration(s) not shipped by this version (likely a downgrade): ${stubbed.join(", ")}`,
    );
  }
  return entries;
}

/**
 * Run all pending migrations
 */
export async function runMigrations(
  db: Kysely<unknown>,
  logger?: Pick<ILogger, "warn">,
): Promise<void> {
  const entries = await buildMigrationSet(db, logger ?? console);
  const migrator = new Migrator({
    db,
    provider: new StaticMigrationProvider(entries),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((result) => {
    if (result.status === "Error") {
      console.error(`Failed to execute migration "${result.migrationName}"`);
    }
  });

  if (error) {
    console.error("Failed to run migrations:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Migration failed: ${errorMessage}`);
  }
}

/**
 * Rollback the last migration
 */
export async function rollbackMigration(db: Kysely<unknown>): Promise<void> {
  const entries = await buildMigrationSet(db, console);
  const migrator = new Migrator({
    db,
    provider: new StaticMigrationProvider(entries),
  });

  const { error, results } = await migrator.migrateDown();

  results?.forEach((result) => {
    if (result.status === "Success") {
      console.log(
        `Migration "${result.migrationName}" was rolled back successfully`,
      );
    } else if (result.status === "Error") {
      console.error(`Failed to rollback migration "${result.migrationName}"`);
    }
  });

  if (error) {
    console.error("Failed to rollback migration:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Rollback failed: ${errorMessage}`);
  }
}
