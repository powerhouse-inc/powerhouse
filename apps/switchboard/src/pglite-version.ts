import type * as CurrentPGliteModuleNs from "@electric-sql/pglite";
import type {
  NodeFsClass,
  VerifyHandle,
} from "@powerhousedao/reactor-api/pglite-node";
import { promises as fs } from "node:fs";
import path from "node:path";

export const CURRENT_PG_MAJOR = 17;
export const SUPPORTED_PG_MAJORS = [16, 17] as const;
export type SupportedPgMajor = (typeof SUPPORTED_PG_MAJORS)[number];

type CurrentPGliteModule = typeof CurrentPGliteModuleNs;

export async function readPgVersionFile(
  dataDir: string,
): Promise<number | null> {
  try {
    const raw = await fs.readFile(path.join(dataDir, "PG_VERSION"), "utf8");
    const major = parseInt(raw.trim(), 10);
    return Number.isFinite(major) ? major : null;
  } catch {
    return null;
  }
}

export function isSupportedMajor(major: number): major is SupportedPgMajor {
  return (SUPPORTED_PG_MAJORS as readonly number[]).includes(major);
}

/**
 * Parses the `PH_FORCE_PG_VERSION` env var. Returns the validated major, or
 * `null` when the var is unset/empty. Throws on any value that is not a
 * supported major — invalid configuration must fail before the server starts
 * touching disk.
 */
export function parseForcePgVersion(
  raw: string | undefined,
): SupportedPgMajor | null {
  if (raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && isSupportedMajor(parsed)) return parsed;
  throw new Error(
    `PH_FORCE_PG_VERSION must be one of: ${SUPPORTED_PG_MAJORS.join(", ")} (got: ${raw})`,
  );
}

export async function loadPGliteModule(
  major: SupportedPgMajor,
): Promise<CurrentPGliteModule> {
  if (major === 16) {
    return (await import("pglite-legacy-02")) as unknown as CurrentPGliteModule;
  }
  return import("@electric-sql/pglite");
}

/** The stock NodeFS class of the PGlite module that opens `major` dirs. */
export async function loadNodeFsClass(
  major: SupportedPgMajor,
): Promise<NodeFsClass> {
  if (major === 16) {
    const mod = await import("pglite-legacy-02/nodefs");
    return mod.NodeFS as unknown as NodeFsClass;
  }
  const mod = await import("@electric-sql/pglite/nodefs");
  return mod.NodeFS;
}

/** Opens a converted dir over stock NodeFS so the conversion can check it. */
export async function openForVerify(
  major: number,
  dataDir: string,
): Promise<VerifyHandle> {
  if (!isSupportedMajor(major)) {
    throw new Error(
      `Cannot verify PGlite data dir ${dataDir}: PG_VERSION=${major} is not supported (expected one of ${SUPPORTED_PG_MAJORS.join(", ")})`,
    );
  }
  const [{ PGlite }, NodeFS] = await Promise.all([
    loadPGliteModule(major),
    loadNodeFsClass(major),
  ]);
  const pg = new PGlite({ fs: new NodeFS(dataDir) });
  await pg.waitReady;
  return pg;
}

type PgDumpFn = (options: {
  pg: unknown;
}) => Promise<{ text(): Promise<string> }>;

export async function loadPgDump(major: SupportedPgMajor): Promise<PgDumpFn> {
  if (major === 16) {
    const mod = (await import("pglite-tools-legacy-02/pg_dump")) as {
      pgDump: PgDumpFn;
    };
    return mod.pgDump;
  }
  const mod = (await import("@electric-sql/pglite-tools/pg_dump")) as {
    pgDump: PgDumpFn;
  };
  return mod.pgDump;
}
