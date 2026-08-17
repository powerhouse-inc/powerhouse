import { Kysely } from "kysely";
import { KyselyOperationStore } from "../storage/kysely/store.js";
import type { PreflightOptions } from "./preflight-options.js";
import {
  parsePreflightOptions,
  preflightExitCode,
  PREFLIGHT_EXIT,
  PREFLIGHT_USAGE,
} from "./preflight-options.js";
import type { Database } from "../storage/kysely/types.js";
import type { DocumentVersionSweepResult } from "./document-version-sweep.js";
import { sweepDocumentVersions } from "./document-version-sweep.js";
import type { StreamOrderSweepResult } from "./stream-order-sweep.js";
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

/**
 * Runs both sweeps and returns the exit code they earned. Never throws: a sweep
 * that failed has checked nothing, and a code claiming one sweep clean because
 * the other died is the one answer this tool must not give.
 */
async function runSweeps(
  scoped: Kysely<Database>,
  options: PreflightOptions,
): Promise<number> {
  const store = new KyselyOperationStore(scoped);

  let streamOrder: StreamOrderSweepResult;
  try {
    streamOrder = await sweepStreamOrder(scoped, store, options.scope);
  } catch (error) {
    reportSweepError(error);
    return PREFLIGHT_EXIT.error;
  }

  for (const { documentId, branch, pair } of streamOrder.failures) {
    console.error(
      `${documentId} ${options.scope}@${branch}: ${pair.kind} — ` +
        `index ${pair.previous.index} (${pair.previous.timestampUtcMs}) ` +
        `then index ${pair.current.index} (${pair.current.timestampUtcMs})`,
    );
  }

  console.log(
    `${streamOrder.streamsChecked} stream(s) checked in ${options.schema}, ${streamOrder.failures.length} unsafe for authEnforcement`,
  );

  let versions: DocumentVersionSweepResult;
  try {
    versions = await sweepDocumentVersions(scoped, store);
  } catch (error) {
    reportSweepError(error);
    return PREFLIGHT_EXIT.error;
  }

  for (const failure of versions.failures) {
    console.error(
      `${failure.documentId} document@${failure.branch}: reducer version ` +
        `${failure.fromVersion} -> ${failure.toVersion} at index ${failure.index}`,
    );
  }

  for (const row of versions.malformed) {
    console.error(
      `${row.documentId} document@${row.branch}: UPGRADE_DOCUMENT at index ` +
        `${row.index} has fromVersion ${row.fromVersion} and toVersion ` +
        `${row.toVersion}, not a number pair, so it cannot be classified`,
    );
  }

  console.log(
    `${versions.documentsChecked} document(s) checked in ${options.schema}, ` +
      `${versions.failures.length} unsafe for authConditions, ` +
      `${versions.malformed.length} unclassifiable`,
  );

  // A row the rule cannot classify blocks authConditions the same way a
  // boundary does: the fleet is not known safe, which is not the same as safe.
  return preflightExitCode(
    streamOrder.failures.length,
    versions.failures.length + versions.malformed.length,
  );
}

function reportSweepError(error: unknown): void {
  console.error(
    "Error:",
    error instanceof Error ? error.message : String(error),
  );
}

async function main() {
  let options: PreflightOptions;
  try {
    options = parsePreflightOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${PREFLIGHT_USAGE}`);
    process.exit(PREFLIGHT_EXIT.usage);
  }

  let db: Kysely<Database>;
  try {
    db = await openDatabase(options);
  } catch (error) {
    console.error(
      "Could not open the store:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(PREFLIGHT_EXIT.error);
  }

  // Scoped the way the reactor scopes it, or every query misses the tables.
  const scoped = db.withSchema(options.schema) as Kysely<Database>;

  let code: number;
  try {
    code = await runSweeps(scoped, options);
  } catch {
    // runSweeps reports its own failures, so reaching here means it broke its
    // contract. Exiting on node's default would read as a stream-order finding.
    code = PREFLIGHT_EXIT.error;
  } finally {
    await db.destroy();
  }

  process.exit(code);
}

void main();
