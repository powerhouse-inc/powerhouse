/**
 * The task catalog: what the builder is asked to build, what gets pinned into
 * its workspace, and how the result is graded.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CATALOG_FILE, PINNED_ROOT } from "./paths.js";
import { AcceptanceKind } from "./schemas.js";

export const DEFAULT_PIN = "6.2.2-dev.62";

/** The published packages the recipes catalog pins as one group. */
export const PINNED_PACKAGE_NAMES = [
  "@powerhousedao/analytics-engine-browser",
  "@powerhousedao/analytics-engine-core",
  "@powerhousedao/ph-cli",
  "@powerhousedao/reactor",
  "@powerhousedao/reactor-browser",
  "@powerhousedao/reactor-group",
  "@powerhousedao/shared",
  "@renown/sdk",
  "document-model",
] as const;

const FileCopy = z.object({
  /** Relative to catalog/pinned/<taskId>/ */
  from: z.string(),
  /** Relative to the workspace root. */
  to: z.string(),
});

export const Task = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  /** Recipe directory name in the recipes checkout; null for brief-only tasks. */
  recipeDir: z.string().nullable(),
  /** briefs/NN-name.md in the recipes checkout; null when a recipe exists. */
  brief: z.string().nullable(),
  difficulty: z.enum(["S", "M", "L"]),
  /** Behaviour the builder must deliver. Never names the implementation. */
  taskPrompt: z.string().min(200),
  /** Files and exports the hidden acceptance tests import. */
  contract: z.array(
    z.object({ file: z.string(), exports: z.array(z.string()) }),
  ),
  /** Copied into the workspace before the builder starts. */
  pinnedInputs: z.array(FileCopy),
  acceptance: z.object({
    kind: AcceptanceKind,
    /** Copied into the workspace only at the acceptance step. */
    files: z.array(FileCopy),
    /** Copy a vitest.config.ts that enables tsconfig paths. */
    vitestConfig: z.boolean().default(false),
  }),
  /** ph-lora section ids the docs should answer this task from. */
  docSections: z.array(z.string()),
  /** @powerhousedao/* (and document-model) names to install at the pin. */
  packages: z.array(z.enum(PINNED_PACKAGE_NAMES)).min(1),
  /** Third-party deps the recipe legitimately needs (name -> range). */
  extraDeps: z.record(z.string(), z.string()).default({}),
  /** Which arms make sense: brief-only tasks have no reference for arm B. */
  arms: z.array(z.enum(["A", "B"])).default(["A", "B"]),
  timeouts: z.object({
    buildMs: z.number().int().positive(),
    acceptanceMs: z.number().int().positive(),
  }),
  budgets: z.object({
    buildUsd: z.number().positive(),
    maxTurns: z.number().int().positive(),
    judgeUsd: z.number().positive(),
    verifyUsd: z.number().positive(),
  }),
});
export type Task = z.infer<typeof Task>;

export const TaskCatalog = z
  .object({
    pin: z.string(),
    tasks: z.array(Task),
  })
  .superRefine((catalog, ctx) => {
    const seen = new Set<string>();
    for (const task of catalog.tasks) {
      if (seen.has(task.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate task id ${task.id}`,
        });
      }
      seen.add(task.id);
      if (task.recipeDir === null && task.arms.includes("B")) {
        ctx.addIssue({
          code: "custom",
          message: `${task.id}: arm B needs a recipeDir to use as reference`,
        });
      }
    }
  });
export type TaskCatalog = z.infer<typeof TaskCatalog>;

export function loadCatalog(file: string = CATALOG_FILE): TaskCatalog {
  const raw = readFileSync(file, "utf8");
  const parsed = TaskCatalog.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `invalid catalog ${file}:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

export function catalogHash(file: string = CATALOG_FILE): string {
  return createHash("sha1")
    .update(readFileSync(file))
    .digest("hex")
    .slice(0, 12);
}

export function pinnedPath(taskId: string, rel: string): string {
  return path.join(PINNED_ROOT, taskId, rel);
}

export type CatalogProblem = { taskId: string; message: string };

/** Structural checks the schema cannot express: referenced files must exist. */
export function validateCatalogFiles(catalog: TaskCatalog): CatalogProblem[] {
  const problems: CatalogProblem[] = [];
  for (const task of catalog.tasks) {
    for (const copy of [...task.pinnedInputs, ...task.acceptance.files]) {
      const source = pinnedPath(task.id, copy.from);
      if (!existsSync(source)) {
        problems.push({
          taskId: task.id,
          message: `missing pinned file ${source}`,
        });
      }
    }
    if (
      task.acceptance.kind === "vitest" &&
      task.acceptance.files.length === 0
    ) {
      problems.push({
        taskId: task.id,
        message: "vitest acceptance with no test files",
      });
    }
  }
  return problems;
}

export function selectTasks(catalog: TaskCatalog, ids: string[]): Task[] {
  if (ids.length === 0) return catalog.tasks;
  const byId = new Map(catalog.tasks.map((t) => [t.id, t]));
  return ids.map((id) => {
    const task = byId.get(id);
    if (!task)
      throw new Error(
        `unknown task ${id}; known: ${[...byId.keys()].join(", ")}`,
      );
    return task;
  });
}
