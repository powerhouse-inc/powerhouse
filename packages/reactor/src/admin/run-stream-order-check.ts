import { Kysely } from "kysely";
import { KyselyOperationStore } from "../storage/kysely/store.js";
import type { PreflightOptions } from "./preflight-options.js";
import { parsePreflightOptions, PREFLIGHT_USAGE } from "./preflight-options.js";
import type { Database } from "../storage/kysely/types.js";
import { sweepDocumentVersions } from "./document-version-sweep.js";
import { sweepStreamOrder } from "./stream-order-sweep.js";

async function openDatabase(
  options: PreflightOptions,
): Promise<Kysely<Database>> {
  if (options.pg) {
    const { PostgresDialect } = await import("kysely");
    const pgModule = await import("pg");
    const pool = new pgModule.default.Pool({
      connectionString: options.pg,
      application_name: "reactor-preflight-auth",
    });
    return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { PGliteDialect } = await import("kysely-pglite-dialect");
  return new Kysely<Database>({
    dialect: new PGliteDialect(new PGlite(options.pglite)),
  });
}

async function main() {
  let options: PreflightOptions;
  try {
    options = parsePreflightOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${PREFLIGHT_USAGE}`);
    process.exit(2);
  }

  let db: Kysely<Database>;
  try {
    db = await openDatabase(options);
  } catch (error) {
    console.error(
      "Could not open the store:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }

  // Scoped the way the reactor scopes it, or every query misses the tables.
  const scoped = db.withSchema(options.schema) as Kysely<Database>;

  let failed = 0;
  try {
    const { streamsChecked, failures } = await sweepStreamOrder(
      scoped,
      new KyselyOperationStore(scoped),
      options.scope,
    );

    failed = failures.length;
    for (const { documentId, branch, pair } of failures) {
      console.error(
        `${documentId} ${options.scope}@${branch}: ${pair.kind} — ` +
          `index ${pair.previous.index} (${pair.previous.timestampUtcMs}) ` +
          `then index ${pair.current.index} (${pair.current.timestampUtcMs})`,
      );
    }

    console.log(
      `${streamsChecked} stream(s) checked in ${options.schema}, ${failed} unsafe for authEnforcement`,
    );

    const versions = await sweepDocumentVersions(scoped);
    for (const failure of versions.failures) {
      console.error(
        `${failure.documentId} document@${failure.branch}: reducer version ` +
          `${failure.fromVersion} -> ${failure.toVersion} at index ${failure.index}`,
      );
    }

    failed += versions.failures.length;
    console.log(
      `${versions.documentsChecked} document(s) checked in ${options.schema}, ` +
        `${versions.failures.length} unsafe for authConditions`,
    );
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  } finally {
    await db.destroy();
  }

  process.exit(failed === 0 ? 0 : 1);
}

void main();
