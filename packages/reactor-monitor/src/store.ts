import { PGlite } from "@electric-sql/pglite";
import type { ReactorStorageConfig } from "./types.js";

/**
 * Overlapping cold boots race on PGlite's un-cloned wasm fetch `Response` and
 * end up re-fetching the fs bundle; a monitor provisions several reactors at
 * once, so construction is chained here rather than left to callers.
 */
let bootChain: Promise<unknown> = Promise.resolve();

function chained<T>(create: () => Promise<T>): Promise<T> {
  const pending = bootChain.then(create, create);
  bootChain = pending.catch(() => undefined);
  return pending;
}

/** What a storage config resolves to, for logging and for `adminInfo`. */
export function storageLocation(
  namespace: string,
  storage: ReactorStorageConfig,
): string {
  switch (storage.kind) {
    case "memory":
      return "memory://";
    case "path":
      return storage.dataDir;
    default:
      return `idb://${namespace}`;
  }
}

/**
 * Opens a fresh PGlite for one reactor.
 *
 * Deliberately not Connect's `getReactorPGlite`: no major detection, no
 * legacy data-dir handling and no migration machinery. A monitor reactor
 * either finds a store this build wrote or starts empty, and the reactor
 * builder runs its own schema migrations over whatever this returns.
 */
export function openReactorStore(
  namespace: string,
  storage: ReactorStorageConfig = { kind: "idb" },
): Promise<PGlite> {
  return chained(async () => {
    // This is the monitor reactor's authoritative operation store, and it
    // self-heals by recreating the instance against this same store
    // (build-reactor.ts). It therefore opens WITHOUT relaxedDurability: a COMMIT
    // must be flushed before it is reported durable, so a recreate - which reads
    // back only the last flushed snapshot - never loses an acknowledged write.
    const pg =
      storage.kind === "memory"
        ? new PGlite()
        : new PGlite(storageLocation(namespace, storage), {
            relaxedDurability: false,
          });
    await pg.waitReady;
    return pg;
  });
}
