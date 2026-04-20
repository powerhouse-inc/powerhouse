import { PGlite } from "@electric-sql/pglite";
import { DEFAULT_RELATIONAL_PROCESSOR_DB_NAME } from "@powerhousedao/shared/processors";
import {
  setMigrationStatus,
  type MigrationPhase,
} from "../components/migration-status.js";

export const CURRENT_PG_MAJOR = 17;

const IDB_STORE_NAME = "FILE_DATA";
const IDB_DB_VERSION = 21;
const BACKUP_PREFIX = "ph-pglite-backup::";
const BACKUP_INDEX_KEY = "ph:pglite-backups";
const BACKUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const PRIMARY_IDB_NAMES = [
  `/pglite/reactor`,
  `/pglite/${DEFAULT_RELATIONAL_PROCESSOR_DB_NAME}`,
] as const;

type FileDataValue = {
  contents: Uint8Array | number[];
  mode: number;
  timestamp: Date | number;
};

type LegacyDumper = (idbName: string) => Promise<string>;

function idbError(req: IDBRequest | IDBTransaction, context: string): Error {
  const cause = req.error ?? new Error("unknown IDB error");
  return new Error(`${context}: ${cause.message}`, { cause });
}

const LEGACY_DUMPERS: Partial<Record<number, () => Promise<LegacyDumper>>> = {
  16: async () => {
    const [{ PGlite: LegacyPGlite }, { pgDump }] = await Promise.all([
      import("pglite-legacy-02"),
      import("pglite-tools-legacy-02/pg_dump"),
    ]);
    return async (idbName: string) => {
      const stripped = idbName.replace(/^\/pglite\//, "");
      const pg = new LegacyPGlite(`idb://${stripped}`);
      try {
        await pg.waitReady;
        const file = await pgDump({ pg });
        return await file.text();
      } finally {
        await pg.close();
      }
    };
  },
};

function indexedDbExists(name: string): Promise<boolean> {
  if (typeof indexedDB.databases === "function") {
    return indexedDB
      .databases()
      .then((dbs) => dbs.some((d) => d.name === name))
      .catch(() => true);
  }
  return Promise.resolve(true);
}

function openIdb(
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

// Emscripten IDBFS holds the IDB connection open past pglite's pg.close(),
// so deleteDatabase can be blocked indefinitely. Callers on the hot path
// should prefer clearFileData() instead; deleteIdb is only used by the
// janitor for expired backups, which tolerates the 15s timeout.
function deleteIdb(name: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const timer = setTimeout(
      () =>
        done(() =>
          reject(
            new Error(`IDB delete timed out for ${name} after ${timeoutMs}ms`),
          ),
        ),
      timeoutMs,
    );
    req.onsuccess = () =>
      done(() => {
        clearTimeout(timer);
        resolve();
      });
    req.onerror = () =>
      done(() => {
        clearTimeout(timer);
        reject(idbError(req, `IDB delete failed for ${name}`));
      });
  });
}

function createFileDataStore(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
    const store = db.createObjectStore(IDB_STORE_NAME);
    store.createIndex("timestamp", "timestamp", { unique: false });
  }
}

async function readPgVersionFile(idbName: string): Promise<number | null> {
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

async function clearFileData(name: string): Promise<void> {
  const db = await openIdb(name, IDB_DB_VERSION, createFileDataStore);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(idbError(tx, `FILE_DATA clear failed for ${name}`));
      tx.onabort = () =>
        reject(idbError(tx, `FILE_DATA clear aborted for ${name}`));
      tx.objectStore(IDB_STORE_NAME).clear();
    });
  } finally {
    db.close();
  }
}

async function cloneFileData(
  sourceName: string,
  destName: string,
): Promise<void> {
  const source = await openIdb(sourceName, IDB_DB_VERSION, createFileDataStore);
  try {
    const dest = await openIdb(destName, IDB_DB_VERSION, createFileDataStore);
    try {
      const readTx = source.transaction(IDB_STORE_NAME, "readonly");
      const readStore = readTx.objectStore(IDB_STORE_NAME);
      const entries = await new Promise<
        Array<{ key: IDBValidKey; value: FileDataValue }>
      >((resolve, reject) => {
        const out: Array<{ key: IDBValidKey; value: FileDataValue }> = [];
        const req = readStore.openCursor();
        req.onerror = () =>
          reject(
            idbError(req, `FILE_DATA read cursor failed for ${sourceName}`),
          );
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return resolve(out);
          out.push({ key: cursor.key, value: cursor.value as FileDataValue });
          cursor.continue();
        };
      });

      await new Promise<void>((resolve, reject) => {
        const writeTx = dest.transaction(IDB_STORE_NAME, "readwrite");
        writeTx.oncomplete = () => resolve();
        writeTx.onerror = () =>
          reject(idbError(writeTx, `FILE_DATA write failed for ${destName}`));
        writeTx.onabort = () =>
          reject(idbError(writeTx, `FILE_DATA write aborted for ${destName}`));
        const writeStore = writeTx.objectStore(IDB_STORE_NAME);
        writeStore.clear();
        for (const { key, value } of entries) {
          writeStore.put(value, key);
        }
      });
    } finally {
      dest.close();
    }
  } finally {
    source.close();
  }
}

type BackupRecord = { name: string; idbName: string; createdAt: number };

function readBackupIndex(): BackupRecord[] {
  try {
    const raw = localStorage.getItem(BACKUP_INDEX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BackupRecord[]) : [];
  } catch {
    return [];
  }
}

function writeBackupIndex(records: BackupRecord[]): void {
  try {
    localStorage.setItem(BACKUP_INDEX_KEY, JSON.stringify(records));
  } catch {
    // ignore quota errors — janitor is best-effort
  }
}

function registerBackup(rec: BackupRecord): void {
  writeBackupIndex([...readBackupIndex(), rec]);
}

function forgetBackup(name: string): void {
  writeBackupIndex(readBackupIndex().filter((r) => r.name !== name));
}

async function janitor(): Promise<void> {
  const cutoff = Date.now() - BACKUP_RETENTION_MS;
  const keep: BackupRecord[] = [];
  for (const rec of readBackupIndex()) {
    if (rec.createdAt >= cutoff) {
      keep.push(rec);
      continue;
    }
    try {
      await deleteIdb(rec.name);
    } catch (err) {
      console.warn(`Failed to delete expired pglite backup ${rec.name}`, err);
      keep.push(rec);
    }
  }
  writeBackupIndex(keep);
}

function publishPhase(idbName: string, phase: MigrationPhase): void {
  setMigrationStatus({ idbName, phase });
}

async function migrateIdbIfNeeded(idbName: string): Promise<void> {
  const major = await readPgVersionFile(idbName);
  if (major === null || major === CURRENT_PG_MAJOR) return;

  const loader = LEGACY_DUMPERS[major];
  if (!loader) {
    throw new Error(
      `Unsupported legacy PGlite data dir: PG_VERSION=${major} for ${idbName}`,
    );
  }

  const backupName = `${BACKUP_PREFIX}${idbName}::${new Date().toISOString()}`;
  const backupRec: BackupRecord = {
    name: backupName,
    idbName,
    createdAt: Date.now(),
  };

  publishPhase(idbName, "clone");
  await cloneFileData(idbName, backupName);
  registerBackup(backupRec);

  let sql: string;
  try {
    publishPhase(idbName, "dump");
    const dump = await loader();
    sql = await dump(idbName);
  } catch (err) {
    await deleteIdb(backupName).catch(() => {});
    forgetBackup(backupName);
    throw err;
  }

  try {
    // Can't deleteDatabase here: Emscripten IDBFS from the legacy PGlite
    // keeps its IDB connection open past pg.close(). Clearing the store
    // in-place leaves the IDB handle alone, and the fresh PGlite will
    // initdb into the empty VFS.
    await clearFileData(idbName);
    publishPhase(idbName, "restore");
    const stripped = idbName.replace(/^\/pglite\//, "");
    const pg = new PGlite(`idb://${stripped}`, { relaxedDurability: false });
    try {
      await pg.waitReady;
      await pg.exec(sql);
    } finally {
      await pg.close();
    }
  } catch (err) {
    await rollbackFromBackup(idbName, backupName, err);
    throw err;
  }
}

async function rollbackFromBackup(
  idbName: string,
  backupName: string,
  originalError: unknown,
): Promise<void> {
  try {
    await clearFileData(idbName).catch(() => {});
    await cloneFileData(backupName, idbName);
  } catch (rollbackErr) {
    console.error(
      `PGlite migration failed AND rollback failed for ${idbName}. Primary error:`,
      originalError,
      "Rollback error:",
      rollbackErr,
    );
    return;
  }
  await deleteIdb(backupName).catch(() => {});
  forgetBackup(backupName);
}

async function migrateAllLocked(): Promise<void> {
  for (const idbName of PRIMARY_IDB_NAMES) {
    await migrateIdbIfNeeded(idbName);
  }
  setMigrationStatus(null);
}

export async function migrateAllIfNeeded(): Promise<void> {
  janitor().catch((err) => console.warn("PGlite backup janitor failed", err));

  const hasLocks =
    typeof navigator !== "undefined" &&
    "locks" in navigator &&
    typeof navigator.locks.request === "function";

  if (!hasLocks) {
    await migrateAllLocked();
    return;
  }

  await navigator.locks.request(
    "ph-pglite-migration",
    { mode: "exclusive" },
    async () => {
      await migrateAllLocked();
    },
  );
}
