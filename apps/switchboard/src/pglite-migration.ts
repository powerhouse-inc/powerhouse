import type { ILogger } from "document-model";
import { promises as fs } from "node:fs";
import {
  CURRENT_PG_MAJOR,
  isSupportedMajor,
  loadPGliteModule,
  loadPgDump,
  readPgVersionFile,
  type SupportedPgMajor,
} from "./pglite-version.js";

type PGliteCtor = new (
  dataDir: string,
  options?: Record<string, unknown>,
) => {
  waitReady: Promise<void>;
  exec: (sql: string) => Promise<unknown>;
  close: () => Promise<void>;
};

function backupPath(dataDir: string, major: number): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${dataDir}.backup-pg${major}-${stamp}`;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function logRestoreFailure(
  dataDir: string,
  sql: string,
  err: unknown,
  logger: ILogger,
): void {
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

  logger.error(
    `[pglite-migration] Restore failed for ${dataDir}: code=${errObj.code ?? ""} severity=${errObj.severity ?? ""} message=${errObj.message ?? ""} sqlLength=${sql.length}`,
  );

  if (Number.isFinite(position) && position > 0) {
    const zeroBased = position - 1;
    const start = Math.max(0, zeroBased - 200);
    const end = Math.min(sql.length, zeroBased + 200);
    const before = sql.slice(start, zeroBased);
    const at = sql.slice(zeroBased, zeroBased + 1);
    const after = sql.slice(zeroBased + 1, end);
    logger.error(
      `[pglite-migration] SQL context around position ${position}:\n${before}»${at}«${after}`,
    );
  } else {
    logger.error(
      `[pglite-migration] No position info. First 2000 chars of dump:\n${sql.slice(0, 2000)}`,
    );
  }
}

/**
 * Migrate a filesystem PGLite data directory from a legacy PG major to the
 * current one. Renames the existing dir to a timestamped backup, dumps via the
 * matching legacy `pg_dump`, restores into a fresh current-version PGLite at
 * the original path. On failure, the original dir is restored from the backup.
 *
 * No-op when the dir is missing or already at the current major.
 */
export async function migratePgliteDir(
  dataDir: string,
  logger: ILogger,
): Promise<void> {
  const major = await readPgVersionFile(dataDir);
  if (major === null) {
    logger.info(
      `[pglite-migration] No PG_VERSION at ${dataDir}; skipping migration`,
    );
    return;
  }
  if (major === CURRENT_PG_MAJOR) return;

  if (!isSupportedMajor(major)) {
    throw new Error(
      `Unsupported legacy PGlite data dir: PG_VERSION=${major} for ${dataDir}`,
    );
  }

  const backupDir = backupPath(dataDir, major);
  logger.info(
    `[pglite-migration] Migrating ${dataDir} from PG${major} to PG${CURRENT_PG_MAJOR}; backup: ${backupDir}`,
  );

  await fs.rename(dataDir, backupDir);

  let sql: string;
  try {
    const [legacyMod, pgDump] = await Promise.all([
      loadPGliteModule(major as SupportedPgMajor),
      loadPgDump(major as SupportedPgMajor),
    ]);
    const LegacyPGlite = (legacyMod as unknown as { PGlite: PGliteCtor })
      .PGlite;
    const pg = new LegacyPGlite(backupDir);
    try {
      await pg.waitReady;
      const file = await pgDump({ pg });
      sql = await file.text();
    } finally {
      await pg.close();
    }
  } catch (err) {
    await rollback(dataDir, backupDir, err, logger);
    throw err;
  }

  try {
    const currentMod = await loadPGliteModule(CURRENT_PG_MAJOR);
    const CurrentPGlite = (currentMod as unknown as { PGlite: PGliteCtor })
      .PGlite;
    const pg = new CurrentPGlite(dataDir, { relaxedDurability: false });
    try {
      await pg.waitReady;
      try {
        await pg.exec("SET standard_conforming_strings = off;");
      } catch (gucErr) {
        logger.warn(
          `[pglite-migration] Could not force standard_conforming_strings=off: ${String(gucErr)}`,
        );
      }
      try {
        await pg.exec(sql);
      } catch (execErr) {
        logRestoreFailure(dataDir, sql, execErr, logger);
        throw execErr;
      }
    } finally {
      await pg.close();
    }
  } catch (err) {
    await rollback(dataDir, backupDir, err, logger);
    throw err;
  }

  logger.info(
    `[pglite-migration] Migration of ${dataDir} complete. Backup retained at ${backupDir}; remove it manually once you have verified the upgrade.`,
  );
}

async function rollback(
  dataDir: string,
  backupDir: string,
  originalError: unknown,
  logger: ILogger,
): Promise<void> {
  try {
    if (await pathExists(dataDir)) {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
    if (await pathExists(backupDir)) {
      await fs.rename(backupDir, dataDir);
    }
  } catch (rollbackErr) {
    logger.error(
      `[pglite-migration] Migration AND rollback failed for ${dataDir}. Original error: ${String(originalError)}; rollback error: ${String(rollbackErr)}; backup may still exist at ${backupDir}.`,
    );
    return;
  }
  logger.error(
    `[pglite-migration] Migration failed for ${dataDir}; rolled back from ${backupDir}. Original error: ${String(originalError)}`,
  );
}
