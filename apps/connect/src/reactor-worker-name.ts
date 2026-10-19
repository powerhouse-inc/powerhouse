const GEN_KEY_PREFIX = "ph-reactor-gen:";

type GenStorage = Pick<Storage, "getItem" | "setItem">;

function genStore(): GenStorage | undefined {
  try {
    return globalThis.localStorage as GenStorage | undefined;
  } catch {
    return undefined;
  }
}

// A persisted generation token, bumped on restart, is part of the
// SharedWorker name so a restart spawns a fresh worker instance while the
// IndexedDB namespace (and its data) stays put.
export function workerNameForGen(
  namespace: string,
  gen: string | null,
): string {
  return gen ? `ph-reactor:${namespace}#${gen}` : `ph-reactor:${namespace}`;
}

export function readWorkerGen(
  namespace: string,
  storage: GenStorage | undefined = genStore(),
): string | null {
  try {
    return storage?.getItem(GEN_KEY_PREFIX + namespace) ?? null;
  } catch {
    return null;
  }
}

/**
 * Gens are unordered tokens, so a reload moves the gen on only from the one
 * this tab's worker runs as; a stale worker's reload never undoes a newer one.
 */
export function adoptWorkerGen(
  namespace: string,
  from: string | null,
  to: string,
  storage: GenStorage | undefined = genStore(),
): void {
  try {
    if (storage?.getItem(GEN_KEY_PREFIX + namespace) !== from) return;
    storage.setItem(GEN_KEY_PREFIX + namespace, to);
  } catch {
    // localStorage unavailable; the reload falls back to reusing the worker.
  }
}
