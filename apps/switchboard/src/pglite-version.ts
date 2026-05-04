import type * as CurrentPGliteModuleNs from "@electric-sql/pglite";
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

export async function loadPGliteModule(
  major: SupportedPgMajor,
): Promise<CurrentPGliteModule> {
  if (major === 16) {
    return (await import("pglite-legacy-02")) as unknown as CurrentPGliteModule;
  }
  return import("@electric-sql/pglite");
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
