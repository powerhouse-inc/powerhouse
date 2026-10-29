import type {
  PlacementEntry,
  PlacementStore,
} from "@powerhousedao/connect-core/runtime";

const DB_NAME = "ph-connect-drive-placement";
const DB_VERSION = 1;
const STORE = "moves";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "slug" });
      }
    };
    req.onerror = () =>
      reject(req.error ?? new Error(`${DB_NAME} open failed`));
    req.onblocked = () => reject(new Error(`${DB_NAME} open blocked`));
    req.onsuccess = () => resolve(req.result);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error(`${DB_NAME} failed`));
      tx.onabort = () => reject(tx.error ?? new Error(`${DB_NAME} aborted`));
    });
  } finally {
    db.close();
  }
}

function isEntry(value: unknown): value is PlacementEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.slug === "string" &&
    typeof entry.backend === "string" &&
    typeof entry.configWas === "string"
  );
}

/** This browser's drive moves, shared by its tabs. Empty without IndexedDB. */
export const placementIdb: PlacementStore = {
  async list() {
    if (typeof indexedDB === "undefined") return [];
    const rows = await run("readonly", (store) => store.getAll());
    return rows.filter(isEntry);
  },
  async put(entry) {
    await run("readwrite", (store) => store.put(entry));
  },
  async delete(slug) {
    await run("readwrite", (store) => store.delete(slug));
  },
};
