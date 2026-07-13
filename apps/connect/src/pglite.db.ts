import type { PGlite } from "@electric-sql/pglite";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import {
  detectReactorPgMajor,
  detectRelationalPgMajor,
  loadPGliteModule,
  resolvePgMajorForRuntime,
  type DetectedMajor,
  type SupportedPgMajor,
} from "./utils/pglite-runtime.js";
import {
  REACTOR_PGLITE_NAME,
  RELATIONAL_PGLITE_NAME,
} from "./utils/storage-namespace.js";

// Separate reactor/relational instances so their transactions can't interleave
// on one session; the wasm download is still shared — PGlite memoizes the
// compiled module per JS realm.

// Off by default: workers hide `Module.FS` (the Inspector needs it) and each
// worker realm re-downloads the wasm.
export const PGLITE_USE_WORKER: boolean = false;

async function createMainThreadPGlite(
  major: SupportedPgMajor,
  dbName: string,
): Promise<PGlite> {
  const { PGlite } = await loadPGliteModule(major);
  const { live } =
    major === 16
      ? await import("pglite-legacy-02/live")
      : await import("@electric-sql/pglite/live");
  return new PGlite(`idb://${dbName}`, {
    relaxedDurability: true,
    extensions: { live },
  }) as unknown as PGlite;
}

async function createWorkerPGlite(
  major: SupportedPgMajor,
  dbName: string,
): Promise<PGlite> {
  // dbName is owned here so the namespace matches the other origin-scoped stores.
  const meta = { dbName };
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

// Overlapping cold boots race on PGlite's un-cloned wasm fetch Response and
// re-fetch the fs bundle; chaining avoids both.
let bootChain: Promise<unknown> = Promise.resolve();

function chainedCreate(create: () => Promise<PGlite>): Promise<PGlite> {
  const pending = bootChain.then(create, create);
  bootChain = pending.catch(() => undefined);
  return pending;
}

function pgliteSingleton(opts: {
  dbName: string;
  detectMajor: () => Promise<DetectedMajor>;
  label: string;
}): () => Promise<PGlite> {
  let cached: Promise<PGlite> | undefined;
  return function getPGlite(): Promise<PGlite> {
    if (cached) return cached;
    const pending = chainedCreate(async () => {
      const major = resolvePgMajorForRuntime(await opts.detectMajor());
      if (major !== 17) {
        console.warn(
          `[${opts.label}] Opening legacy Postgres ${major} data dir. Migrate to PG17 from the banner or the Inspector → Debug tab.`,
        );
      }
      return PGLITE_USE_WORKER
        ? createWorkerPGlite(major, opts.dbName)
        : createMainThreadPGlite(major, opts.dbName);
    });
    // Don't cache a rejection: let a later call retry a transient IDB/wasm failure.
    cached = pending;
    pending.catch(() => {
      if (cached === pending) cached = undefined;
    });
    return pending;
  };
}

export const getReactorPGlite = pgliteSingleton({
  dbName: REACTOR_PGLITE_NAME,
  detectMajor: detectReactorPgMajor,
  label: "reactor",
});

const getRelationalPGlite = pgliteSingleton({
  dbName: RELATIONAL_PGLITE_NAME,
  detectMajor: detectRelationalPgMajor,
  label: "relational",
});

export async function getDb() {
  const pgLite = await getRelationalPGlite();
  const relationalDb = createRelationalDb(
    new Kysely({
      dialect: new PGliteDialect(pgLite),
    }),
  );
  return { pgLite, relationalDb };
}
