import type * as CurrentPGliteModuleNs from "@electric-sql/pglite";

export const CURRENT_PG_MAJOR = 17;
export const SUPPORTED_PG_MAJORS = [16, 17] as const;
export type SupportedPgMajor = (typeof SUPPORTED_PG_MAJORS)[number];
export type DetectedMajor = SupportedPgMajor | null;

type CurrentPGliteModule = typeof CurrentPGliteModuleNs;

export function coerceMajor(value: number | null): DetectedMajor {
  if (value === null) return null;
  return (SUPPORTED_PG_MAJORS as readonly number[]).includes(value)
    ? (value as SupportedPgMajor)
    : null;
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

type PgDumpFn = (options: {
  pg: unknown;
}) => Promise<{ text(): Promise<string> }>;

/**
 * Loads the pg_dump tool for the given PGlite major. pg_dump's VFS layout is
 * version-specific, so using the wrong major against a live PGlite instance
 * fails with Emscripten ENOENT (errno 44).
 */
export async function loadPgDump(major: SupportedPgMajor): Promise<PgDumpFn> {
  if (major === 16) {
    const mod = (await import("pglite-tools-legacy-02/pg_dump")) as {
      pgDump: PgDumpFn;
    };
    return mod.pgDump;
  }
  if (major === 17) {
    const mod = (await import("@electric-sql/pglite-tools/pg_dump")) as {
      pgDump: PgDumpFn;
    };
    return mod.pgDump;
  }
  throw new Error(`Unsupported PGlite major: ${String(major)}`);
}
