import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ChurnResult, ColdStartResult } from "../checks/replicas.js";
import type { OwnershipResult } from "../checks/ownership.js";
import type { PackageListResult } from "../checks/package-list.js";
import type { VisibilityResult } from "../checks/visibility.js";

export const RESULTS_DIR = path.resolve(import.meta.dirname, "../../results");

export interface RunResult {
  mode: "docker" | "dev";
  label: string;
  ref?: string;
  sha?: string;
  image?: string;
  registryUrl?: string;
  auth: "renown" | "verdaccio";
  runId: string;
  startedAt: string;
  finishedAt?: string;
  visibility?: VisibilityResult;
  packageList?: PackageListResult;
  churn?: ChurnResult;
  coldStart?: ColdStartResult;
  ownership?: OwnershipResult;
  cleanup?: { name: string; ok: boolean; goneAfter: boolean }[];
  /** Per dev pod, the package count its last warm-up logged, before and after. */
  podWarmCounts?: {
    before: Record<string, number>;
    after: Record<string, number>;
  };
  errors: { check: string; error: string }[];
}

export function writeResult(file: string, result: RunResult): string {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const out = path.join(RESULTS_DIR, file);
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  return out;
}

/** Runs a check, recording a failure instead of stopping the run. */
export async function attempt<T>(
  result: RunResult,
  check: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[${check}] failed:`, err);
    result.errors.push({ check, error: String(err) });
    return undefined;
  }
}
