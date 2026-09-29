import { REACTOR_SCHEMA } from "@powerhousedao/reactor";
import type { Kysely, Migration, MigrationProvider } from "kysely";
import { Migrator, sql } from "kysely";
import * as migration0001 from "./0001_erasure_requests.js";
import * as migration0002 from "./0002_subject_documents.js";

const REACTOR_PRIVACY_MIGRATION_TABLE = "kysely_migration_reactor_privacy";
const REACTOR_PRIVACY_MIGRATION_LOCK_TABLE =
  "kysely_migration_reactor_privacy_lock";

export interface ReactorPrivacyMigrationResult {
  success: boolean;
  migrationsExecuted: string[];
  error?: Error;
}

/** Raw statements (the audit trigger) need the schema named. */
function migrationsFor(schema: string): Record<string, Migration> {
  return {
    "0001_erasure_requests": {
      up: (db) => migration0001.up(db, schema),
      down: (db) => migration0001.down(db, schema),
    },
    "0002_subject_documents": {
      up: (db) => migration0002.up(db),
      down: (db) => migration0002.down(db),
    },
  };
}

class ProgrammaticMigrationProvider implements MigrationProvider {
  constructor(private readonly schema: string) {}

  getMigrations() {
    return Promise.resolve(migrationsFor(this.schema));
  }
}

function migratorFor(db: Kysely<unknown>, schema: string): Migrator {
  return new Migrator({
    db: db.withSchema(schema),
    provider: new ProgrammaticMigrationProvider(schema),
    migrationTableSchema: schema,
    migrationTableName: REACTOR_PRIVACY_MIGRATION_TABLE,
    migrationLockTableName: REACTOR_PRIVACY_MIGRATION_LOCK_TABLE,
  });
}

export async function runReactorPrivacyMigrations(
  db: Kysely<unknown>,
  schema: string = REACTOR_SCHEMA,
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

  let error: unknown;
  let results: Awaited<ReturnType<Migrator["migrateToLatest"]>>["results"];
  try {
    const result = await migratorFor(db, schema).migrateToLatest();
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

export async function getReactorPrivacyMigrationStatus(
  db: Kysely<unknown>,
  schema: string = REACTOR_SCHEMA,
) {
  return await migratorFor(db, schema).getMigrations();
}
