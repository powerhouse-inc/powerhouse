import type * as CurrentPGliteModuleNs from "@electric-sql/pglite";
import {
  readPgVersionFile,
  REACTOR_IDB_NAME,
  RELATIONAL_IDB_NAME,
} from "./pglite-idb.js";

export const CURRENT_PG_MAJOR = 17;
export const SUPPORTED_PG_MAJORS = [16, 17] as const;
export type SupportedPgMajor = (typeof SUPPORTED_PG_MAJORS)[number];

type DetectedMajor = SupportedPgMajor | null;

type CurrentPGliteModule = typeof CurrentPGliteModuleNs;

let cachedReactorMajor: DetectedMajor | undefined;
let inflight: Promise<DetectedMajor> | undefined;
const majorListeners = new Set<() => void>();

function notifyMajorChanged() {
  for (const l of majorListeners) l();
}

export function subscribeReactorPgMajor(cb: () => void): () => void {
  majorListeners.add(cb);
  return () => {
    majorListeners.delete(cb);
  };
}

function coerceMajor(value: number | null): DetectedMajor {
  if (value === null) return null;
  return (SUPPORTED_PG_MAJORS as readonly number[]).includes(value)
    ? (value as SupportedPgMajor)
    : null;
}

export async function detectReactorPgMajor(): Promise<DetectedMajor> {
  if (cachedReactorMajor !== undefined) return cachedReactorMajor;
  if (inflight) return inflight;

  inflight = (async () => {
    const major = coerceMajor(await readPgVersionFile(REACTOR_IDB_NAME));
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
  notifyMajorChanged();
}

export async function detectRelationalPgMajor(): Promise<DetectedMajor> {
  return coerceMajor(await readPgVersionFile(RELATIONAL_IDB_NAME));
}

/**
 * Pick the PGlite major to use for *new* reactor clients: fall back to the
 * current version when there is no existing data dir.
 */
export function resolvePgMajorForRuntime(
  detected: DetectedMajor,
): SupportedPgMajor {
  return detected ?? CURRENT_PG_MAJOR;
}

/**
 * Loads the PGlite module that matches an on-disk data dir major version.
 *
 * The 0.2.x and 0.3.x modules expose the same runtime interface (PGlite class,
 * `idb://` data-dir support, waitReady, exec/query/transaction, close). The
 * return type is pinned to the current package's module so callers can use it
 * against `kysely-pglite-dialect` which peer-depends on both majors.
 */
export async function loadPGliteModule(
  major: SupportedPgMajor,
): Promise<CurrentPGliteModule> {
  if (major === 16) {
    return (await import("pglite-legacy-02")) as unknown as CurrentPGliteModule;
  }
  if (major === 17) return import("@electric-sql/pglite");
  throw new Error(`Unsupported PGlite major: ${String(major)}`);
}
