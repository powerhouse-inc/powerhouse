import {
  CURRENT_PGLITE_MODULE,
  type PGliteWorkerStoreOptions,
} from "../../../src/pglite/worker/protocol.js";
import {
  ThreadedPGlite,
  type ThreadedPGliteOptions,
} from "../../../src/pglite/worker/threaded-pglite.js";

/** A fresh in-memory store needs initdb; the Windows runner is slower under load. */
export const BOOT_TIMEOUT_MS = 90_000;

export const BOOTSTRAP = new URL(
  "./pglite-worker-bootstrap.mjs",
  import.meta.url,
);

export const ABORT_BOOTSTRAP = new URL(
  "./pglite-worker-abort-bootstrap.mjs",
  import.meta.url,
);

export const SIMULATE_ABORT_SQL = "select 'ph:test-abort'";

export function memoryStore(
  overrides: Partial<PGliteWorkerStoreOptions> = {},
): PGliteWorkerStoreOptions {
  return {
    label: "test-store",
    dataDir: null,
    module: CURRENT_PGLITE_MODULE,
    durableFs: null,
    parsers: "utc-timestamps",
    ...overrides,
  };
}

export function startThreadedPGlite(
  options: Partial<ThreadedPGliteOptions> = {},
): ThreadedPGlite {
  return new ThreadedPGlite({
    store: memoryStore(),
    workerScript: BOOTSTRAP,
    ...options,
  });
}
