import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { runMigrations, getMigrationStatus } from "./migrator.js";

async function main() {
  const command = process.argv[2];

  const kyselyPGlite = await KyselyPGlite.create();
  const db = new Kysely<any>({
    dialect: kyselyPGlite.dialect,
  });

  try {
    if (command === "up" || !command) {
      console.log("Running migrations...");
      const result = await runMigrations(db);

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
    } else if (command === "status") {
      console.log("Checking migration status...");
      const migrations = await getMigrationStatus(db);

      console.log("\nMigration Status:");
      console.log("=================");

      for (const migration of migrations) {
        const status = migration.executedAt
          ? `✓ Executed at ${migration.executedAt.toISOString()}`
          : "○ Pending";
        console.log(`${status} - ${migration.name}`);
      }
    } else {
      console.error(`Unknown command: ${command}`);
      console.log("\nUsage:");
      console.log("  pnpm migrate       - Run pending migrations");
      console.log("  pnpm migrate up    - Run pending migrations");
      console.log("  pnpm migrate status - Show migration status");
      process.exit(1);
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
