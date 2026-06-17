import {
  Migrator,
  type Kysely,
  type Migration,
  type MigrationProvider,
} from "kysely";
import * as migration001 from "./001_create_document_permissions.js";
import * as migration002 from "./002_add_document_protection.js";
import * as migration003 from "./003_remove_group_tables.js";

/**
 * Custom migration provider that loads migrations from imported modules
 */
class StaticMigrationProvider implements MigrationProvider {
  getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve({
      "001_create_document_permissions": migration001,
      "002_add_document_protection": migration002,
      "003_remove_group_tables": migration003,
    });
  }
}

/**
 * Run all pending migrations
 */
export async function runMigrations(db: Kysely<unknown>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new StaticMigrationProvider(),
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
  const migrator = new Migrator({
    db,
    provider: new StaticMigrationProvider(),
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
