import { normalizeReactorName } from "../naming.js";

// After apps/connect/src/reactor-worker-name.ts, with an in-realm fallback.
const GEN_KEY_PREFIX = "ph-reactor-monitor-gen:";

type GenStorage = Pick<Storage, "getItem" | "setItem">;

const inRealm = new Map<string, string>();
const realmStore: GenStorage = {
  getItem: (key) => inRealm.get(key) ?? null,
  setItem: (key, value) => {
    inRealm.set(key, value);
  },
};

// localStorage shares the gen with the origin's other tabs, as the worker is.
function genStore(): GenStorage {
  try {
    return (globalThis.localStorage as GenStorage | undefined) ?? realmStore;
  } catch {
    return realmStore;
  }
}

function genKey(name: string): string {
  return GEN_KEY_PREFIX + normalizeReactorName(name);
}

export function readWorkerGen(
  name: string,
  storage: GenStorage = genStore(),
): string | null {
  try {
    return storage.getItem(genKey(name));
  } catch {
    return null;
  }
}

/** Only moves from this handle's gen; a stale reload never undoes a newer one. */
export function adoptWorkerGen(
  name: string,
  from: string | null,
  to: string,
  storage: GenStorage = genStore(),
): void {
  try {
    if (storage.getItem(genKey(name)) !== from) return;
    storage.setItem(genKey(name), to);
  } catch {
    // Unavailable: the retired worker redirects the next provision again.
  }
}
