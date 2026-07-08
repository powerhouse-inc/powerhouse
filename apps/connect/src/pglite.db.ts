import type { PGlite } from "@electric-sql/pglite";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import {
  detectReactorPgMajor,
  loadPGliteModule,
  resolvePgMajorForRuntime,
  type SupportedPgMajor,
} from "./utils/pglite-runtime.js";
import { REACTOR_PGLITE_NAME } from "./utils/storage-namespace.js";

// Run the shared reactor/relational PGlite in a Web Worker instead of the main
// thread. Off by default: the worker hides `Module.FS`, which the Inspector needs.
export const PGLITE_USE_WORKER: boolean = false;

async function createMainThreadPGlite(
  major: SupportedPgMajor,
): Promise<PGlite> {
  const { PGlite } = await loadPGliteModule(major);
  const { live } =
    major === 16
      ? await import("pglite-legacy-02/live")
      : await import("@electric-sql/pglite/live");
  return new PGlite(`idb://${REACTOR_PGLITE_NAME}`, {
    relaxedDurability: true,
    extensions: { live },
  }) as unknown as PGlite;
}

async function createWorkerPGlite(major: SupportedPgMajor): Promise<PGlite> {
  // dbName is owned here so the namespace matches the other origin-scoped stores.
  const meta = { dbName: REACTOR_PGLITE_NAME };
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
    }) as unknown as PGlite;
  }
  const [{ PGliteWorker }, { live }] = await Promise.all([
    import("@electric-sql/pglite/worker"),
    import("@electric-sql/pglite/live"),
  ]);
  const worker = new Worker(new URL("./pglite.worker.js", import.meta.url), {
    type: "module",
  });
  return PGliteWorker.create(worker, {
    meta,
    extensions: { live },
  }) as unknown as PGlite;
}

let sharedPGlite: Promise<PGlite> | undefined;

// Single PGlite shared by the reactor store and the relational read models
// (kept in their own schemas). Memoized so the WASM/data load happens once.
export function getSharedPGlite(): Promise<PGlite> {
  if (sharedPGlite) return sharedPGlite;
  const pending = (async () => {
    const major = resolvePgMajorForRuntime(await detectReactorPgMajor());
    if (major !== 17) {
      console.warn(
        `[reactor] Opening legacy Postgres ${major} data dir. Migrate to PG17 from the banner or the Inspector → Debug tab.`,
      );
    }
    return PGLITE_USE_WORKER
      ? createWorkerPGlite(major)
      : createMainThreadPGlite(major);
  })();
  // Don't cache a rejection: let a later call retry a transient IDB/wasm failure.
  sharedPGlite = pending;
  pending.catch(() => {
    if (sharedPGlite === pending) sharedPGlite = undefined;
  });
  return pending;
}

export async function getDb() {
  const pgLite = await getSharedPGlite();
  const relationalDb = createRelationalDb(
    new Kysely({
      dialect: new PGliteDialect(pgLite),
    }),
  );
  return { pgLite, relationalDb };
}
