/**
 * Per-run runtime state the steps need but Mastra cannot carry: drivers, the
 * semaphore, root directories. Mastra validates step input against zod and
 * persists it, so class instances cannot travel in inputData. requestContext
 * would work for the default engine but is typed Record<string, any> and gets
 * merged from snapshots on resume, so the steps look the context up here by
 * runId instead (every step input carries runId).
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import {
  loadCatalog,
  selectTasks,
  type Task,
  type TaskCatalog,
} from "./catalog.js";
import type { ClaudeDriver } from "./claude-driver.js";
import { CATALOG_FILE } from "./paths.js";
import { defaultHarnessContext } from "./drivers.js";
import type { RunArgs } from "./schemas.js";
import type { Semaphore } from "./semaphore.js";

export interface HarnessContext {
  /** Builder. */
  driver: ClaudeDriver;
  /** Judge and verifier. */
  judgeDriver: ClaudeDriver;
  runsRoot: string;
  recipesRoot: string;
  monorepoRoot: string;
  /** Overrides catalog/pinned. */
  pinnedRoot?: string;
  /** Overrides catalog/tasks.json. */
  catalogFile?: string;
  /** Overrides FINDINGS.jsonl. */
  findingsFile?: string;
  /** Overrides RUNS.jsonl. */
  runsFile?: string;
  /** Overrides prompts/. */
  promptsRoot?: string;
  /** No install, no tsc, no vitest; drivers are expected to be fakes. */
  dryRun: boolean;
  /** Bounds concurrent claude processes across the whole run. */
  semaphore: Semaphore;
  log: (line: string) => void;
}

const contexts = new Map<string, HarnessContext>();

export function setHarnessContext(runId: string, ctx: HarnessContext): void {
  contexts.set(runId, ctx);
}

/**
 * The CLI registers a context before starting a run. A run started elsewhere
 * (Mastra Studio) has none, so with the workflow's RunArgs in hand the steps
 * build the default one and register it for the rest of the run.
 */
export function getHarnessContext(
  runId: string,
  args?: RunArgs,
): HarnessContext {
  const ctx = contexts.get(runId);
  if (ctx) return ctx;
  if (!args) {
    throw new Error(`no harness context registered for run ${runId}`);
  }
  const built = defaultHarnessContext(runId, args);
  contexts.set(runId, built);
  return built;
}

export function clearHarnessContext(runId: string): void {
  contexts.delete(runId);
}

const catalogs = new Map<string, TaskCatalog>();

/** Loaded once per catalog file per process. */
export function catalogOf(
  ctx: Pick<HarnessContext, "catalogFile">,
): TaskCatalog {
  const file = ctx.catalogFile ?? CATALOG_FILE;
  let catalog = catalogs.get(file);
  if (!catalog) {
    catalog = loadCatalog(file);
    catalogs.set(file, catalog);
  }
  return catalog;
}

export function taskOf(
  ctx: Pick<HarnessContext, "catalogFile">,
  taskId: string,
): Task {
  return selectTasks(catalogOf(ctx), [taskId])[0];
}

/**
 * Roots the builder must not read. A deny rule on the monorepo root would
 * also deny the workspace when runs live inside it (the default,
 * tools/doc-harness/runs), so in that case the siblings of every directory
 * on the path from the monorepo root down to the runs root are denied
 * instead. Only directories: settings.ts spells rules as `<dir>/**`.
 */
export function deniedRoots(
  o: Pick<HarnessContext, "monorepoRoot" | "recipesRoot" | "runsRoot">,
): string[] {
  const monorepo = path.resolve(o.monorepoRoot);
  const runs = path.resolve(o.runsRoot);
  const rel = path.relative(monorepo, runs);
  const inside = rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  if (!inside) return [monorepo, path.resolve(o.recipesRoot)];

  const roots: string[] = [];
  let dir = monorepo;
  for (const segment of rel.split(path.sep)) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== segment) {
        roots.push(path.join(dir, entry.name));
      }
    }
    dir = path.join(dir, segment);
  }
  roots.push(path.resolve(o.recipesRoot));
  return roots;
}
