import {
  preparePgliteDataDir,
  removeStalePgliteFiles,
  type ConversionDeps,
} from "@powerhousedao/reactor-api/pglite-node";
import type { ILogger } from "document-model";
import { promises as fs } from "node:fs";
import { migratePgliteDir } from "./pglite-migration.js";
import {
  CURRENT_PG_MAJOR,
  openForVerify,
  readPgVersionFile,
  type SupportedPgMajor,
} from "./pglite-version.js";

export interface PglitePreflightOptions {
  /** Local PGlite data dirs; Postgres URLs are already filtered out. */
  dirs: string[];
  forcePgVersion?: SupportedPgMajor;
  migratePglite?: boolean;
  /** PH_PGLITE_IN_MEMORY: the dirs are never opened, so nothing is touched. */
  inMemory: boolean;
  logger: ILogger;
  /** Test hook; defaults to the module-matched stock NodeFS. */
  openForVerify?: ConversionDeps["openForVerify"];
}

const RM_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 10,
  retryDelay: 100,
} as const;

/**
 * Prepares every local PGlite dir before the first open and returns the
 * PG major detected on disk per dir. Conversion of an AtomicNodeFs snapshot
 * runs for every dir, before the major is read, so a pure-snapshot PG16 dir
 * is converted and then migrated.
 */
export async function runPglitePreflight(
  options: PglitePreflightOptions,
): Promise<Map<string, number>> {
  const { dirs, logger } = options;
  const detectedMajors = new Map<string, number>();
  if (options.inMemory || dirs.length === 0) return detectedMajors;

  if (options.forcePgVersion !== undefined) {
    if (options.migratePglite) {
      logger.warn(
        "PH_FORCE_PG_VERSION is set; ignoring --migrate-pglite/PH_MIGRATE_PGLITE because the data dirs will be wiped.",
      );
    }
    logger.warn(
      `PH_FORCE_PG_VERSION=${options.forcePgVersion} set; wiping PGLite data dirs and re-initializing at PG${options.forcePgVersion}.`,
    );
    for (const dir of dirs) {
      // Conversion siblings go too, or the next boot refuses to initdb beside them.
      for (const p of [dir, `${dir}.converting`, `${dir}.old`]) {
        await fs.rm(p, RM_OPTIONS);
      }
      logger.info(`Wiped PGLite data dir ${dir}`);
    }
    return detectedMajors;
  }

  const deps: ConversionDeps = {
    openForVerify: options.openForVerify ?? openForVerify,
    logger,
  };
  for (const dir of dirs) {
    await preparePgliteDataDir(dir, deps);
    const major = await readPgVersionFile(dir);
    if (major !== null) detectedMajors.set(dir, major);
  }

  if (options.migratePglite) {
    for (const [dir, major] of detectedMajors) {
      if (major === CURRENT_PG_MAJOR) continue;
      await migratePgliteDir(dir, logger);
      // The migration's own close leaves a lockfile in the new dir.
      await removeStalePgliteFiles(dir, logger);
      const after = await readPgVersionFile(dir);
      if (after !== null) detectedMajors.set(dir, after);
    }
  } else {
    for (const [dir, major] of detectedMajors) {
      if (major === CURRENT_PG_MAJOR) continue;
      logger.warn(
        `PGLite data dir at ${dir} was created with PG${major} but Switchboard ships PG${CURRENT_PG_MAJOR}. Running on legacy PGLite. Re-start with --migrate-pglite (or PH_MIGRATE_PGLITE=true) to upgrade.`,
      );
    }
  }
  return detectedMajors;
}
