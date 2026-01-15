import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import {
  runMigrations,
  getMigrationStatus,
  REACTOR_SCHEMA,
} from "@powerhousedao/reactor";

interface MigrationOptions {
  dbPath?: string;
  statusOnly?: boolean;
}

function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

export async function runSwitchboardMigrations(
  options: MigrationOptions,
): Promise<void> {
  const dbPath =
    options.dbPath ??
    process.env.PH_REACTOR_DATABASE_URL ??
    process.env.DATABASE_URL;

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
    if (options.statusOnly) {
      console.log("\nChecking migration status...");
      const migrations = await getMigrationStatus(db, REACTOR_SCHEMA);

      console.log("\nMigration Status:");
      console.log("=================");

      for (const migration of migrations) {
        const status = migration.executedAt
          ? `[OK] Executed at ${migration.executedAt.toISOString()}`
          : "[--] Pending";
        console.log(`${status} - ${migration.name}`);
      }
    } else {
      console.log("\nRunning migrations...");
      const result = await runMigrations(db, REACTOR_SCHEMA);

      if (!result.success) {
        console.error("Migration failed:", result.error?.message);
        process.exit(1);
      }

      if (result.migrationsExecuted.length === 0) {
        console.log("No migrations to run - database is up to date");
      } else {
        console.log(
          `Successfully executed ${result.migrationsExecuted.length} migration(s):`,
        );
        for (const name of result.migrationsExecuted) {
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
