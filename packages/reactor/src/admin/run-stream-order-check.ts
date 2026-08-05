import { PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { KyselyOperationStore } from "../storage/kysely/store.js";
import type { Database } from "../storage/kysely/types.js";
import { sweepStreamOrder } from "./stream-order-sweep.js";

/**
 * Pre-flight for `authEnforcement`. Sweeps every stream that carries auth
 * operations and reports the ones the auth projection could not walk, or that
 * the monotonic rule would refuse to replicate.
 *
 * Exits non-zero when anything is reported, so it can gate a rollout.
 */
async function main() {
  const scope = process.argv[2] ?? "auth";

  // Same connection wiring as run-migrations.ts.
  const db = new Kysely<Database>({
    dialect: new PGliteDialect(new PGlite()),
  });

  let failed = 0;
  try {
    const { streamsChecked, failures } = await sweepStreamOrder(
      db,
      new KyselyOperationStore(db),
      scope,
    );

    failed = failures.length;
    for (const { documentId, branch, pair } of failures) {
      console.error(
        `${documentId} ${scope}@${branch}: ${pair.kind} — ` +
          `index ${pair.previous.index} (${pair.previous.timestampUtcMs}) ` +
          `then index ${pair.current.index} (${pair.current.timestampUtcMs})`,
      );
    }

    console.log(
      `${streamsChecked} stream(s) checked, ${failed} unsafe for authEnforcement`,
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
