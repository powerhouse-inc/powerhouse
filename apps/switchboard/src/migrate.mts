#!/usr/bin/env node
import dotenv from "dotenv";
import { isDotenvDisabled } from "@powerhousedao/shared/clis/project-env";
import {
  DEPRECATIONS_REMOVED_IN,
  presentConfigKeys,
} from "@powerhousedao/shared/clis/deprecations";
if (!isDotenvDisabled()) dotenv.config();

import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import {
  runMigrations,
  getMigrationStatus,
  REACTOR_SCHEMA,
} from "@powerhousedao/reactor";
import {
  getReactorDriveMigrationStatus,
  runReactorDriveMigrations,
} from "@powerhousedao/reactor-drive";
import { getConfig } from "@powerhousedao/config/node";

const REMOVED_DATABASE_KEY = "switchboard.database.url";

function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

async function main() {
  const command = process.argv[2];

  const dbPath =
    process.env.PH_SWITCHBOARD_DATABASE_URL ??
    process.env.PH_REACTOR_DATABASE_URL ??
    process.env.DATABASE_URL;

  // The config key named the database until 6.4. Skipping the migrations
  // because it is no longer read would look like success, so refuse instead.
  if (
    !dbPath &&
    presentConfigKeys(getConfig(), [REMOVED_DATABASE_KEY]).length > 0
  ) {
    console.error(
      `powerhouse.config.json "${REMOVED_DATABASE_KEY}" was removed in ${DEPRECATIONS_REMOVED_IN} and this command no longer reads it. ` +
        "Set PH_REACTOR_DATABASE_URL to the database URL and remove the key.",
    );
    process.exit(1);
  }

  if (!dbPath || !isPostgresUrl(dbPath)) {
    console.log("No PostgreSQL URL configured. Skipping migrations.");
    console.log("(PGlite migrations are handled automatically on startup)");
    return;
  }

  console.log(`Database: ${dbPath}`);

  const pool = new Pool({ connectionString: dbPath });

  const db = new Kysely<any>({
    dialect: new PostgresDialect({ pool }),
  });

  try {
    if (command === "status") {
      console.log("\nChecking migration status...");
      const migrations = await getMigrationStatus(db, REACTOR_SCHEMA);

      console.log("\nReactor Migration Status:");
      console.log("=========================");

      for (const migration of migrations) {
        const status = migration.executedAt
          ? `[OK] Executed at ${migration.executedAt.toISOString()}`
          : "[--] Pending";
        console.log(`${status} - ${migration.name}`);
      }

      const driveMigrations = await getReactorDriveMigrationStatus(
        db,
        REACTOR_SCHEMA,
      );

      console.log("\nReactor-Drive Migration Status:");
      console.log("===============================");

      for (const migration of driveMigrations) {
        const status = migration.executedAt
          ? `[OK] Executed at ${migration.executedAt.toISOString()}`
          : "[--] Pending";
        console.log(`${status} - ${migration.name}`);
      }
    } else {
      console.log("\nRunning reactor migrations...");
      const result = await runMigrations(db, REACTOR_SCHEMA);

      if (!result.success) {
        console.error("Migration failed:", result.error?.message);
        process.exit(1);
      }

      if (result.migrationsExecuted.length === 0) {
        console.log("No reactor migrations to run - database is up to date");
      } else {
        console.log(
          `Successfully executed ${result.migrationsExecuted.length} reactor migration(s):`,
        );
        for (const name of result.migrationsExecuted) {
          console.log(`  - ${name}`);
        }
      }

      console.log("\nRunning reactor-drive migrations...");
      const driveResult = await runReactorDriveMigrations(db, REACTOR_SCHEMA);

      if (!driveResult.success) {
        console.error(
          "Reactor-drive migration failed:",
          driveResult.error?.message,
        );
        process.exit(1);
      }

      if (driveResult.migrationsExecuted.length === 0) {
        console.log(
          "No reactor-drive migrations to run - database is up to date",
        );
      } else {
        console.log(
          `Successfully executed ${driveResult.migrationsExecuted.length} reactor-drive migration(s):`,
        );
        for (const name of driveResult.migrationsExecuted) {
          console.log(`  - ${name}`);
        }
      }
    }
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

void main();
