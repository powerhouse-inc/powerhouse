import { PGlite } from "@electric-sql/pglite";
import {
  setMigrationStatus,
  type MigrationPhase,
} from "../components/migration-status.js";
import {
  createFileDataStore,
  IDB_DB_VERSION,
  IDB_STORE_NAME,
  idbError,
  openIdb,
  readPgVersionFile,
} from "./pglite-idb.js";
import { CURRENT_PG_MAJOR } from "./pglite-runtime.js";
import { PRIMARY_IDB_NAMES } from "./storage-namespace.js";

const BACKUP_PREFIX = "ph-pglite-backup::";
const BACKUP_INDEX_KEY = "ph:pglite-backups";
const BACKUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type FileDataValue = {
  contents: Uint8Array | number[];
  mode: number;
  timestamp: Date | number;
};

type LegacyDumper = (idbName: string) => Promise<string>;

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
      // PGlite 0.2.x pg_dump emits SQL literals with doubled backslashes
      // (escape-string form) but does not always emit the matching
      // `SET standard_conforming_strings = off`. PG17 defaults that GUC to on,
      // so '\\"' in the dump is parsed as a literal backslash + end-of-string
      // and JSONB re-parsing fails. Force off at the session level before
      // running the dump so doubled backslashes collapse as intended.
      console.info(
        `[pglite-migration] Dump preamble (first 500 chars):\n${sql.slice(0, 500)}`,
      );
      try {
        await pg.exec("SET standard_conforming_strings = off;");
      } catch (gucErr) {
        console.warn(
          "[pglite-migration] Could not force standard_conforming_strings=off",
          gucErr,
        );
      }
      try {
        await pg.exec(sql);
      } catch (execErr) {
        logRestoreFailure(idbName, sql, execErr);
        throw execErr;
      }
    } finally {
      await pg.close();
    }
  } catch (err) {
    await rollbackFromBackup(idbName, backupName, err);
    throw err;
  }
}

function logRestoreFailure(idbName: string, sql: string, err: unknown): void {
  const errObj = err as {
    message?: string;
    position?: string | number;
    severity?: string;
    code?: string;
    detail?: string;
    where?: string;
    internalQuery?: string;
  };
  const position =
    typeof errObj.position === "string"
      ? parseInt(errObj.position, 10)
      : typeof errObj.position === "number"
        ? errObj.position
        : NaN;

  console.error(`[pglite-migration] Restore failed for ${idbName}`, {
    message: errObj.message,
    code: errObj.code,
    severity: errObj.severity,
    detail: errObj.detail,
    where: errObj.where,
    position: errObj.position,
    sqlLength: sql.length,
  });

  if (Number.isFinite(position) && position > 0) {
    const zeroBased = position - 1;
    const start = Math.max(0, zeroBased - 200);
    const end = Math.min(sql.length, zeroBased + 200);
    const before = sql.slice(start, zeroBased);
    const at = sql.slice(zeroBased, zeroBased + 1);
    const after = sql.slice(zeroBased + 1, end);
    console.error(
      `[pglite-migration] SQL context around position ${position}:\n${before}»${at}«${after}`,
    );
    const lineStart = sql.lastIndexOf("\n", zeroBased) + 1;
    const lineEnd = sql.indexOf("\n", zeroBased);
    const line = sql.slice(lineStart, lineEnd === -1 ? sql.length : lineEnd);
    console.error(
      `[pglite-migration] Failing line (truncated to 500 chars):\n${line.slice(0, 500)}`,
    );
  } else {
    console.error(
      `[pglite-migration] No position info. First 2000 chars of dump:\n${sql.slice(0, 2000)}`,
    );
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
