import {
  REACTOR_PGLITE_NAME,
  RELATIONAL_PGLITE_NAME,
} from "./storage-namespace.js";

export const IDB_STORE_NAME = "FILE_DATA";
export const IDB_DB_VERSION = 21;

export const REACTOR_IDB_NAME = `/pglite/${REACTOR_PGLITE_NAME}`;
export const RELATIONAL_IDB_NAME = `/pglite/${RELATIONAL_PGLITE_NAME}`;

export const PRIMARY_IDB_NAMES = [
  REACTOR_IDB_NAME,
  RELATIONAL_IDB_NAME,
] as const;

type FileDataValue = {
  contents: Uint8Array | number[];
  mode: number;
  timestamp: Date | number;
};

export function idbError(
  req: IDBRequest | IDBTransaction,
  context: string,
): Error {
  const cause = req.error ?? new Error("unknown IDB error");
  return new Error(`${context}: ${cause.message}`, { cause });
}

export function indexedDbExists(name: string): Promise<boolean> {
  if (typeof indexedDB.databases === "function") {
    return indexedDB
      .databases()
      .then((dbs) => dbs.some((d) => d.name === name))
      .catch(() => true);
  }
  return Promise.resolve(true);
}

export function openIdb(
  name: string,
  version: number,
  upgrade?: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onerror = () => reject(idbError(req, `IDB open failed for ${name}`));
    req.onblocked = () => reject(new Error(`IDB open blocked for ${name}`));
    req.onupgradeneeded = () => upgrade?.(req.result);
    req.onsuccess = () => resolve(req.result);
  });
}

export function createFileDataStore(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
    const store = db.createObjectStore(IDB_STORE_NAME);
    store.createIndex("timestamp", "timestamp", { unique: false });
  }
}

export async function readPgVersionFile(
  idbName: string,
): Promise<number | null> {
  if (!(await indexedDbExists(idbName))) return null;
  let db: IDBDatabase;
  try {
    db = await openIdb(idbName, IDB_DB_VERSION, createFileDataStore);
  } catch {
    return null;
  }
  try {
    if (!db.objectStoreNames.contains(IDB_STORE_NAME)) return null;
    const tx = db.transaction(IDB_STORE_NAME, "readonly");
    const store = tx.objectStore(IDB_STORE_NAME);
    const value = await new Promise<FileDataValue | null>((resolve, reject) => {
      const req = store.openCursor();
      req.onerror = () =>
        reject(idbError(req, `FILE_DATA cursor failed for ${idbName}`));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve(null);
        const key = typeof cursor.key === "string" ? cursor.key : "";
        if (key.endsWith("/PG_VERSION")) {
          resolve(cursor.value as FileDataValue);
        } else {
          cursor.continue();
        }
      };
    });
    if (!value) return null;
    const bytes =
      value.contents instanceof Uint8Array
        ? value.contents
        : new Uint8Array(value.contents);
    const text = new TextDecoder().decode(bytes).trim();
    const major = parseInt(text, 10);
    return Number.isFinite(major) ? major : null;
  } finally {
    db.close();
  }
}
