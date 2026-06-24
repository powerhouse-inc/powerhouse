import { PGlite } from "@electric-sql/pglite";
import {
  createFileDataStore,
  IDB_DB_VERSION,
  IDB_STORE_NAME,
  idbError,
  openIdb,
  readPgVersionFile,
} from "./pglite-idb.js";
import { CURRENT_PG_MAJOR } from "./pglite-major.js";

export type MigrationPhase = "clone" | "dump" | "restore";

export type FileDataValue = {
  contents: Uint8Array | number[];
  mode: number;
  timestamp: Date | number;
};

export type FileDataEntry = { key: IDBValidKey; value: FileDataValue };

// Snapshots a data dir before migration and restores/discards it after. The
// flag-off path persists to an IDB backup (with retention); the worker keeps
// the snapshot in memory for same-run rollback only.
export interface BackupStrategy {
  snapshot(idbName: string): Promise<unknown>;
  rollback(handle: unknown, idbName: string): Promise<void>;
  discard(handle: unknown): Promise<void>;
  commit(handle: unknown): Promise<void>;
}

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

export async function clearFileData(idbName: string): Promise<void> {
  const db = await openIdb(idbName, IDB_DB_VERSION, createFileDataStore);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(idbError(tx, `FILE_DATA clear failed for ${idbName}`));
      tx.onabort = () =>
        reject(idbError(tx, `FILE_DATA clear aborted for ${idbName}`));
      tx.objectStore(IDB_STORE_NAME).clear();
    });
  } finally {
    db.close();
  }
}

export async function readFileData(idbName: string): Promise<FileDataEntry[]> {
  const db = await openIdb(idbName, IDB_DB_VERSION, createFileDataStore);
  try {
    return await new Promise<FileDataEntry[]>((resolve, reject) => {
      const out: FileDataEntry[] = [];
      const req = db
        .transaction(IDB_STORE_NAME, "readonly")
        .objectStore(IDB_STORE_NAME)
        .openCursor();
      req.onerror = () =>
        reject(idbError(req, `FILE_DATA read cursor failed for ${idbName}`));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve(out);
        out.push({ key: cursor.key, value: cursor.value as FileDataValue });
        cursor.continue();
      };
    });
  } finally {
    db.close();
  }
}

export async function writeFileData(
  idbName: string,
  entries: FileDataEntry[],
): Promise<void> {
  const db = await openIdb(idbName, IDB_DB_VERSION, createFileDataStore);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(idbError(tx, `FILE_DATA write failed for ${idbName}`));
      tx.onabort = () =>
        reject(idbError(tx, `FILE_DATA write aborted for ${idbName}`));
      const store = tx.objectStore(IDB_STORE_NAME);
      store.clear();
      for (const { key, value } of entries) {
        store.put(value, key);
      }
    });
  } finally {
    db.close();
  }
}

export async function cloneFileData(
  sourceName: string,
  destName: string,
): Promise<void> {
  await writeFileData(destName, await readFileData(sourceName));
}

function logRestoreFailure(idbName: string, sql: string, err: unknown): void {
  const errObj = err as {
    message?: string;
    position?: string | number;
    severity?: string;
    code?: string;
    detail?: string;
    where?: string;
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
    console.error(
      `[pglite-migration] SQL context around position ${position}:\n${sql.slice(start, zeroBased)}»${sql.slice(zeroBased, zeroBased + 1)}«${sql.slice(zeroBased + 1, end)}`,
    );
  } else {
    console.error(
      `[pglite-migration] No position info. First 2000 chars of dump:\n${sql.slice(0, 2000)}`,
    );
  }
}

async function restoreDumpIntoIdb(idbName: string, sql: string): Promise<void> {
  const stripped = idbName.replace(/^\/pglite\//, "");
  const pg = new PGlite(`idb://${stripped}`, { relaxedDurability: false });
  try {
    await pg.waitReady;
    // PG16 pg_dump emits doubled backslashes (escape-string form) without the
    // matching SET; PG17 defaults standard_conforming_strings on, breaking JSONB.
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
}

export async function migrateIdb(
  idbName: string,
  publishPhase: (phase: MigrationPhase) => void,
  backup: BackupStrategy,
): Promise<void> {
  const major = await readPgVersionFile(idbName);
  if (major === null || major === CURRENT_PG_MAJOR) return;

  const loader = LEGACY_DUMPERS[major];
  if (!loader) {
    throw new Error(
      `Unsupported legacy PGlite data dir: PG_VERSION=${major} for ${idbName}`,
    );
  }

  publishPhase("clone");
  const handle = await backup.snapshot(idbName);

  let sql: string;
  try {
    publishPhase("dump");
    const dump = await loader();
    sql = await dump(idbName);
  } catch (err) {
    await backup.discard(handle);
    throw err;
  }

  try {
    await clearFileData(idbName);
    publishPhase("restore");
    await restoreDumpIntoIdb(idbName, sql);
  } catch (err) {
    await backup.rollback(handle, idbName);
    throw err;
  }
  await backup.commit(handle);
}
