import type { ILogger } from "document-model";
import { promises as fs } from "node:fs";
import path from "node:path";
import { extractSnapshot, SNAPSHOT_FILE_NAME } from "./snapshot-reader.js";

export interface VerifyHandle {
  query<T>(sql: string): Promise<{ rows: T[] }>;
  close(): Promise<void>;
}

export type ConversionStep =
  | "extract"
  | "verify"
  | "renameOld"
  | "renameNew"
  | "removeOld";

export interface ConversionDeps {
  /** Opens `dataDir` with the stock NodeFS of the PGlite module for `major`. */
  openForVerify: (major: number, dataDir: string) => Promise<VerifyHandle>;
  logger: ILogger;
  /** Test hook: throw after a named step to simulate a crash there. */
  afterStep?: (step: ConversionStep) => void | Promise<void>;
}

const RM_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 10,
  retryDelay: 100,
} as const;

interface Siblings {
  dir: string;
  converting: string;
  old: string;
  snapshot: string;
}

function siblingsOf(dir: string): Siblings {
  const resolved = path.resolve(dir);
  return {
    dir: resolved,
    converting: `${resolved}.converting`,
    old: `${resolved}.old`,
    snapshot: path.join(resolved, SNAPSHOT_FILE_NAME),
  };
}

/** Settles the debris of an interrupted conversion; runs before it at boot. */
export async function recoverConversion(
  dir: string,
  deps: ConversionDeps,
): Promise<void> {
  const s = siblingsOf(dir);
  const [dirExists, convertingExists, oldExists] = await Promise.all([
    exists(s.dir),
    exists(s.converting),
    exists(s.old),
  ]);

  if (!dirExists) {
    if (convertingExists) {
      // Died between the two renames: finish the swap.
      await fs.rename(s.converting, s.dir);
      if (oldExists) await fs.rm(s.old, RM_OPTIONS);
      deps.logger.warn(
        `PGlite conversion of ${s.dir} was interrupted after the swap started; completed it`,
      );
      return;
    }
    if (oldExists) {
      throw new Error(
        `PGlite data dir ${s.dir} is missing but ${s.old} exists; refusing to initialize beside it. Inspect and rename or remove ${s.old}.`,
      );
    }
    return;
  }

  const snapshotExists = await exists(s.snapshot);
  if (snapshotExists) {
    // The snapshot is authoritative; anything beside it is debris.
    if (convertingExists) await fs.rm(s.converting, RM_OPTIONS);
    if (oldExists) await fs.rm(s.old, RM_OPTIONS);
    return;
  }

  // dir is a converted PGDATA; anything beside it is superseded.
  if (oldExists) await fs.rm(s.old, RM_OPTIONS);
  if (convertingExists) {
    deps.logger.warn(
      `Removing stray ${s.converting}; ${s.dir} holds no snapshot and is authoritative`,
    );
    await fs.rm(s.converting, RM_OPTIONS);
  }
}

/** Extracts into `.converting`, verifies by opening it, swaps through `.old`. */
export async function convertSnapshotDir(
  dir: string,
  deps: ConversionDeps,
): Promise<"converted" | "none"> {
  const s = siblingsOf(dir);
  if (!(await exists(s.snapshot))) return "none";

  const startedAt = performance.now();
  await fs.rm(s.converting, RM_OPTIONS);
  await fs.mkdir(s.converting, { mode: 0o700 });

  let snapshotBytes: number;
  let entries: number;
  try {
    ({ bytes: snapshotBytes, entries } = await extractAndVerify(s, deps));
  } catch (err) {
    await fs.rm(s.converting, RM_OPTIONS);
    throw err;
  }

  await fs.rename(s.dir, s.old);
  await deps.afterStep?.("renameOld");
  await fs.rename(s.converting, s.dir);
  await deps.afterStep?.("renameNew");
  await fs.rm(s.old, RM_OPTIONS);
  await deps.afterStep?.("removeOld");

  const convertedBytes = await treeBytes(s.dir);
  const durationMs = Math.round(performance.now() - startedAt);
  deps.logger.info(
    `Converted PGlite snapshot at ${s.dir}: snapshot ${snapshotBytes} bytes -> ${convertedBytes} bytes on disk, ${entries} entries, ${durationMs} ms`,
  );
  return "converted";
}

async function extractAndVerify(
  s: Siblings,
  deps: ConversionDeps,
): Promise<{ bytes: number; entries: number }> {
  const extracted = await extractSnapshot(s.snapshot, s.converting);
  await deps.afterStep?.("extract");

  if (!extracted.pgControl) {
    throw new Error(`${s.snapshot} has no global/pg_control entry`);
  }
  const expectedIdentifier = extracted.pgControl.readBigUInt64LE(0).toString();
  const handle = await deps.openForVerify(
    extracted.pgVersionMajor,
    s.converting,
  );
  try {
    await verifyOpenStore(handle, expectedIdentifier);
  } finally {
    // Must close before the renames; Windows refuses to rename an open dir.
    await handle.close();
  }
  await fs.rm(path.join(s.converting, "postmaster.pid"), { force: true });
  if (await exists(path.join(s.converting, SNAPSHOT_FILE_NAME))) {
    throw new Error(
      `Extracted PGlite data dir ${s.converting} contains ${SNAPSHOT_FILE_NAME}`,
    );
  }
  await deps.afterStep?.("verify");
  return { bytes: extracted.bytes, entries: extracted.entries };
}

async function verifyOpenStore(
  handle: VerifyHandle,
  expectedIdentifier: string,
): Promise<void> {
  // numeric parses to a float above 2^53; compare as text.
  const ident = await handle.query<{ system_identifier: string }>(
    "SELECT system_identifier::text AS system_identifier FROM pg_control_system()",
  );
  const actual = ident.rows[0]?.system_identifier;
  if (actual !== expectedIdentifier) {
    throw new Error(
      `PGlite system identifier mismatch after extraction: pg_control says ${expectedIdentifier}, server says ${String(actual)}`,
    );
  }
  const tables = await handle.query<{ qualified: string }>(
    "SELECT format('%I.%I', schemaname, tablename) AS qualified FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1",
  );
  for (const { qualified } of tables.rows) {
    await handle.query(`SELECT count(*) FROM ${qualified}`);
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function treeBytes(dir: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await treeBytes(full);
    } else if (entry.isFile()) {
      total += (await fs.stat(full)).size;
    }
  }
  return total;
}
