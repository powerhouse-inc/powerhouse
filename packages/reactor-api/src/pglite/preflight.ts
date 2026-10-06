import { PGlite } from "@electric-sql/pglite";
import { NodeFS } from "@electric-sql/pglite/nodefs";
import type { ILogger } from "document-model";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  convertSnapshotDir,
  recoverConversion,
  type ConversionDeps,
  type VerifyHandle,
} from "./convert-snapshot-dir.js";

/** PG major of the pinned @electric-sql/pglite; it exports none, so the test checks initdb. */
export const CURRENT_PGLITE_MAJOR = 17;

/** `openForVerify` over the loaded PGlite module only. */
export async function openCurrentPgliteForVerify(
  major: number,
  dataDir: string,
): Promise<VerifyHandle> {
  if (major !== CURRENT_PGLITE_MAJOR) {
    throw new Error(
      `PGlite snapshot at ${dataDir} is PG${major}; this process only opens PG${CURRENT_PGLITE_MAJOR} data dirs`,
    );
  }
  const pg = new PGlite({ fs: new NodeFS(dataDir) });
  await pg.waitReady;
  return pg;
}

/** Converts a snapshot store and clears the files a previous run leaves behind. */
export async function preparePgliteDataDir(
  dir: string,
  deps: ConversionDeps,
): Promise<void> {
  await recoverConversion(dir, deps);
  await convertSnapshotDir(dir, deps);
  await removeStalePgliteFiles(dir, deps.logger);
}

/** PGlite leaves `postmaster.pid` after every close and `pg_wal/xlogtemp.*` after some. */
export async function removeStalePgliteFiles(
  dir: string,
  logger: Pick<ILogger, "debug">,
): Promise<void> {
  const lockfile = path.join(dir, "postmaster.pid");
  let hadLockfile = true;
  try {
    await fs.unlink(lockfile);
  } catch {
    hadLockfile = false;
  }
  if (hadLockfile) logger.debug(`Removed PGlite lockfile ${lockfile}`);

  const walDir = path.join(dir, "pg_wal");
  let names: string[];
  try {
    names = await fs.readdir(walDir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith("xlogtemp.")) continue;
    await fs.rm(path.join(walDir, name), { force: true });
    logger.debug(`Removed PGlite temp WAL file ${path.join(walDir, name)}`);
  }
}
