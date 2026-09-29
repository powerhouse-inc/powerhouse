import { Kysely } from "kysely";
import {
  readCatchUpStatus,
  rescanCatchUp,
  type CatchUpAdminDatabase,
} from "./catch-up-admin.js";
import {
  CATCHUP_EXIT,
  CATCHUP_USAGE,
  parseCatchUpOptions,
  type CatchUpOptions,
} from "./catchup-options.js";

async function openDatabase(
  options: CatchUpOptions,
): Promise<Kysely<CatchUpAdminDatabase>> {
  if (options.pg) {
    const { PostgresDialect } = await import("kysely");
    const pgModule = await import("pg");
    const pool = new pgModule.default.Pool({
      connectionString: options.pg,
      application_name: "reactor-catchup",
    });
    return new Kysely<CatchUpAdminDatabase>({
      dialect: new PostgresDialect({ pool }),
    });
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { PGliteDialect } = await import("kysely-pglite-dialect");
  return new Kysely<CatchUpAdminDatabase>({
    dialect: new PGliteDialect(new PGlite(options.pglite)),
  });
}

async function printStatus(db: Kysely<CatchUpAdminDatabase>): Promise<void> {
  const status = await readCatchUpStatus(db);
  console.log(
    `sequence head ${status.head}, settled through ${status.settledThrough}`,
  );
  if (status.waitingOn.length > 0) {
    console.log(`waiting on xid ${status.waitingOn.join(", ")}`);
  }
  for (const session of status.sessions) {
    console.log(
      `  pid ${session.pid} ${session.applicationName} ${session.state} since ${session.xactStart ?? "?"} (xid ${session.xid})`,
    );
  }
  for (const cursor of status.cursors) {
    console.log(
      `${cursor.kind} ${cursor.id}: at ${cursor.lastOrdinal}, lag ${cursor.lag}`,
    );
  }
}

async function runRescan(
  db: Kysely<CatchUpAdminDatabase>,
  options: CatchUpOptions,
): Promise<void> {
  const result = await rescanCatchUp(db, {
    from: options.from!,
    consumers: options.consumers,
    all: options.all,
    dryRun: options.dryRun,
  });
  for (const change of result.changes) {
    console.log(
      `${change.kind} ${change.id}: ${change.lastOrdinal} -> ${change.lowered}`,
    );
  }
  console.log(
    `${result.rowsAbove} operation(s) above ${options.from}${options.dryRun ? " (dry run, nothing written)" : ""}`,
  );
}

async function main() {
  let options: CatchUpOptions;
  try {
    options = parseCatchUpOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${CATCHUP_USAGE}`);
    process.exit(CATCHUP_EXIT.usage);
  }

  let db: Kysely<CatchUpAdminDatabase>;
  try {
    db = await openDatabase(options);
  } catch (error) {
    console.error(
      "Could not open the store:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(CATCHUP_EXIT.error);
  }

  const scoped = db.withSchema(options.schema);
  let code: number = CATCHUP_EXIT.done;
  try {
    if (options.command === "status") {
      await printStatus(scoped);
    } else {
      await runRescan(scoped, options);
    }
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    code = CATCHUP_EXIT.error;
  } finally {
    await db.destroy();
  }

  process.exit(code);
}

void main();
