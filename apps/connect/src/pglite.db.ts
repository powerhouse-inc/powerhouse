import type { PGliteWorker } from "@electric-sql/pglite/worker";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import {
  detectRelationalPgMajor,
  resolvePgMajorForRuntime,
  type SupportedPgMajor,
} from "./utils/pglite-runtime.js";
import { RELATIONAL_PGLITE_NAME } from "./utils/storage-namespace.js";

async function createPGliteWorkerForMajor(
  major: SupportedPgMajor,
): Promise<PGliteWorker> {
  // The worker reads the data-dir name from meta so the namespace is owned on
  // the main thread alongside the other origin-scoped stores.
  const meta = { dbName: RELATIONAL_PGLITE_NAME };
  if (major === 16) {
    const [legacyWorker, legacyLive] = await Promise.all([
      import("pglite-legacy-02/worker"),
      import("pglite-legacy-02/live"),
    ]);
    const worker = new Worker(
      new URL("./pglite.worker.legacy.js", import.meta.url),
      { type: "module" },
    );
    return legacyWorker.PGliteWorker.create(worker, {
      meta,
      extensions: { live: legacyLive.live },
    }) as unknown as PGliteWorker;
  }
  const [{ PGliteWorker }, { live }] = await Promise.all([
    import("@electric-sql/pglite/worker"),
    import("@electric-sql/pglite/live"),
  ]);
  const worker = new Worker(new URL("./pglite.worker.js", import.meta.url), {
    type: "module",
  });
  return PGliteWorker.create(worker, { meta, extensions: { live } });
}

export async function getDb() {
  const detected = await detectRelationalPgMajor();
  const major = resolvePgMajorForRuntime(detected);
  if (major !== 17) {
    console.warn(
      `[reactor] Relational worker is opening legacy Postgres ${major} data dir. Migrate to PG17 from the banner or the Inspector → Debug tab.`,
    );
  }

  const pgLite = await createPGliteWorkerForMajor(major);

  const kysely = new Kysely({
    dialect: new PGliteDialect(pgLite),
  });

  const relationalDb = createRelationalDb(kysely);

  return { pgLite, relationalDb };
}
