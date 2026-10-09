import type { PGlite } from "@electric-sql/pglite";
import { HardenedPGliteDialect } from "@powerhousedao/reactor";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import { Kysely } from "kysely";
import {
  detectReactorPgMajor,
  detectRelationalPgMajor,
  loadPGliteModule,
  resolvePgMajorForRuntime,
  type DetectedMajor,
  type SupportedPgMajor,
} from "./utils/pglite-runtime.js";
import { reloadPageForPoisonedStore } from "./utils/poisoned-store-budget.js";
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
  relaxedDurability: boolean,
): Promise<PGlite> {
  const { PGlite } = await loadPGliteModule(major);
  const { live } =
    major === 16
      ? await import("pglite-legacy-02/live")
      : await import("@electric-sql/pglite/live");
  return new PGlite(`idb://${dbName}`, {
    relaxedDurability,
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

const CLOSE_TIMEOUT_MS = 30_000;

type PGliteSingleton = {
  get: () => Promise<PGlite>;
  /**
   * Closes and forgets the instance; the next get reopens after the close. A
   * close that does not settle leaves the store unusable until a reload.
   */
  discard: () => Promise<void>;
};

function pgliteSingleton(opts: {
  dbName: string;
  detectMajor: () => Promise<DetectedMajor>;
  label: string;
  relaxedDurability: boolean;
}): PGliteSingleton {
  let cached: Promise<PGlite> | undefined;
  // A second idb:// instance beside one still closing would overwrite its pages.
  let unusable: Error | undefined;
  return {
    get(): Promise<PGlite> {
      if (cached) return cached;
      const pending = chainedCreate(async () => {
        if (unusable) throw unusable;
        const major = resolvePgMajorForRuntime(await opts.detectMajor());
        if (major !== 17) {
          console.warn(
            `[${opts.label}] Opening legacy Postgres ${major} data dir. Migrate to PG17 from the banner or the Inspector → Debug tab.`,
          );
        }
        return PGLITE_USE_WORKER
          ? createWorkerPGlite(major, opts.dbName)
          : createMainThreadPGlite(major, opts.dbName, opts.relaxedDurability);
      });
      // Don't cache a rejection: let a later call retry a transient IDB/wasm failure.
      cached = pending;
      pending.catch(() => {
        if (cached === pending) cached = undefined;
      });
      return pending;
    },
    async discard(): Promise<void> {
      const pending = cached;
      if (!pending) return;
      cached = undefined;
      const closing = bootChain.then(async () => {
        const pg = await pending;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            pg.close(),
            new Promise<void>((resolve) => {
              timer = setTimeout(() => {
                unusable = new Error(
                  `[${opts.label}] PGlite did not close within ${CLOSE_TIMEOUT_MS}ms; reload the page to reopen its store`,
                );
                console.warn(unusable.message);
                resolve();
              }, CLOSE_TIMEOUT_MS);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      });
      bootChain = closing.catch(() => undefined);
      try {
        await closing;
      } catch (error) {
        console.error(`[${opts.label}] closing PGlite failed:`, error);
      }
    },
  };
}

// Not relaxed: group commit flushes through syncToFs, which a relaxed
// instance resolves before the sync has run.
const reactorPGlite = pgliteSingleton({
  dbName: REACTOR_PGLITE_NAME,
  detectMajor: detectReactorPgMajor,
  label: "reactor",
  relaxedDurability: false,
});
export const getReactorPGlite = reactorPGlite.get;
export const discardReactorPGlite = reactorPGlite.discard;

const getRelationalPGlite = pgliteSingleton({
  dbName: RELATIONAL_PGLITE_NAME,
  detectMajor: detectRelationalPgMajor,
  label: "relational",
  relaxedDurability: true,
}).get;

export async function getDb() {
  const pgLite = await getRelationalPGlite();
  const relationalDb = createRelationalDb(
    new Kysely({
      dialect: new HardenedPGliteDialect(pgLite, {
        onPoisoned: reloadPageForPoisonedStore,
      }),
    }),
  );
  return { pgLite, relationalDb };
}
