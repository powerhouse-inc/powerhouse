import { readPgVersionFile } from "./pglite-idb.js";
import {
  coerceMajor,
  isMigratableMajor,
  type DetectedMajor,
} from "./pglite-major.js";
import {
  REACTOR_IDB_NAME,
  REACTOR_STORE_IN_MEMORY,
  RELATIONAL_IDB_NAME,
} from "./storage-namespace.js";

export {
  CURRENT_PG_MAJOR,
  SUPPORTED_PG_MAJORS,
  coerceMajor,
  resolvePgMajorForRuntime,
  loadPGliteModule,
  loadPgDump,
  type SupportedPgMajor,
  type DetectedMajor,
} from "./pglite-major.js";

// An in-memory store has no data dir: always the current major, never migrated.
function readStoreMajor(idbName: string): Promise<number | null> {
  return REACTOR_STORE_IN_MEMORY
    ? Promise.resolve(null)
    : readPgVersionFile(idbName);
}

let cachedReactorMajor: DetectedMajor | undefined;
let inflight: Promise<DetectedMajor> | undefined;
const majorListeners = new Set<() => void>();

let cachedMigrationMajor: DetectedMajor | undefined;
let migrationInflight: Promise<DetectedMajor> | undefined;
const migrationListeners = new Set<() => void>();

function notifyMajorChanged() {
  for (const l of majorListeners) l();
}

function notifyMigrationChanged() {
  for (const l of migrationListeners) l();
}

export function subscribeReactorPgMajor(cb: () => void): () => void {
  majorListeners.add(cb);
  return () => {
    majorListeners.delete(cb);
  };
}

export async function detectReactorPgMajor(): Promise<DetectedMajor> {
  if (cachedReactorMajor !== undefined) return cachedReactorMajor;
  if (inflight) return inflight;

  inflight = (async () => {
    const major = coerceMajor(await readStoreMajor(REACTOR_IDB_NAME));
    cachedReactorMajor = major;
    notifyMajorChanged();
    return major;
  })();
  try {
    return await inflight;
  } finally {
    inflight = undefined;
  }
}

export function getCachedReactorPgMajor(): DetectedMajor | undefined {
  return cachedReactorMajor;
}

export function invalidateReactorPgMajorCache(): void {
  cachedReactorMajor = undefined;
  cachedMigrationMajor = undefined;
  notifyMajorChanged();
  notifyMigrationChanged();
}

export async function detectRelationalPgMajor(): Promise<DetectedMajor> {
  return coerceMajor(await readStoreMajor(RELATIONAL_IDB_NAME));
}

export function subscribeMigrationMajor(cb: () => void): () => void {
  migrationListeners.add(cb);
  return () => {
    migrationListeners.delete(cb);
  };
}

export function getCachedMigrationMajor(): DetectedMajor | undefined {
  return cachedMigrationMajor;
}

/**
 * Legacy major the migration banner should prompt for: the first primary store
 * (reactor or relational) on a supported, non-current major. Spans both stores
 * to match migrateAllIfNeeded.
 */
export async function detectMigrationMajor(): Promise<DetectedMajor> {
  if (cachedMigrationMajor !== undefined) return cachedMigrationMajor;
  if (migrationInflight) return migrationInflight;

  migrationInflight = (async () => {
    const majors = await Promise.all([
      readStoreMajor(REACTOR_IDB_NAME),
      readStoreMajor(RELATIONAL_IDB_NAME),
    ]);
    const legacy = majors.find(isMigratableMajor) ?? null;
    cachedMigrationMajor = legacy;
    notifyMigrationChanged();
    return legacy;
  })();
  try {
    return await migrationInflight;
  } finally {
    migrationInflight = undefined;
  }
}
