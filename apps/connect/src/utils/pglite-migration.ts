import { setMigrationStatus } from "../components/migration-status.js";
import { idbError } from "./pglite-idb.js";
import {
  type BackupStrategy,
  cloneFileData,
  migrateIdb,
} from "./pglite-migrate-core.js";
import { PRIMARY_IDB_NAMES } from "./storage-namespace.js";

const BACKUP_PREFIX = "ph-pglite-backup::";
const BACKUP_INDEX_KEY = "ph:pglite-backups";
const BACKUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type BackupRecord = { name: string; idbName: string; createdAt: number };

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

// Persistent backup to an IDB dir, indexed in localStorage with 30-day
// retention (the janitor reaps expired ones); success keeps the backup.
function createPersistentBackup(): BackupStrategy {
  return {
    snapshot: async (idbName) => {
      const backupName = `${BACKUP_PREFIX}${idbName}::${new Date().toISOString()}`;
      await cloneFileData(idbName, backupName);
      registerBackup({ name: backupName, idbName, createdAt: Date.now() });
      return backupName;
    },
    rollback: async (handle, idbName, cause) => {
      const backupName = handle as string;
      try {
        // clone clears-and-replaces in one txn; no pre-clear (which could empty the dir).
        await cloneFileData(backupName, idbName);
      } catch (rollbackErr) {
        console.error(
          `PGlite migration rollback failed for ${idbName}; backup ${backupName} retained. Primary migration error:`,
          cause,
          "Rollback error:",
          rollbackErr,
        );
        return;
      }
      await deleteIdb(backupName).catch(() => undefined);
      forgetBackup(backupName);
    },
    discard: async (handle) => {
      const backupName = handle as string;
      await deleteIdb(backupName).catch(() => undefined);
      forgetBackup(backupName);
    },
    commit: () => Promise.resolve(),
  };
}

async function migrateAllLocked(): Promise<void> {
  const backup = createPersistentBackup();
  try {
    for (const idbName of PRIMARY_IDB_NAMES) {
      await migrateIdb(
        idbName,
        (phase) => setMigrationStatus({ idbName, phase }),
        backup,
      );
    }
  } finally {
    setMigrationStatus(null);
  }
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
