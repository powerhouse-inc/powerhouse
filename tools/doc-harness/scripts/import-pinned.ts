// Regenerates catalog/pinned/ from the recipes checkout; rerun on a pin bump.
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { loadCatalog } from "../src/lib/catalog.js";
import { PINNED_ROOT, recipesRoot } from "../src/lib/paths.js";

const SKIP_DIRS = new Set(["node_modules", "dist", ".tsbuild"]);

function skip(p: string): boolean {
  const base = path.basename(p);
  return SKIP_DIRS.has(base) || base.endsWith(".tsbuildinfo");
}

function parseArgs(argv: string[]): { recipes: string } {
  let recipes = recipesRoot();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--recipes") {
      const value = argv[i + 1];
      if (!value) throw new Error("--recipes needs a directory");
      recipes = path.resolve(value);
      i++;
    } else {
      throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  return { recipes };
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function removeEmptyDirs(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirs(path.join(dir, entry.name));
  }
  if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
}

function isUnder(file: string, root: string): boolean {
  const rel = path.relative(root, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

type Summary = {
  taskId: string;
  copied: number;
  removed: number;
  missing: string[];
};

function importTask(
  taskId: string,
  recipeDir: string,
  froms: string[],
  recipes: string,
): Summary {
  const pinnedDir = path.join(PINNED_ROOT, taskId);
  const summary: Summary = { taskId, copied: 0, removed: 0, missing: [] };
  const keep: string[] = [];

  for (const from of froms) {
    const source = path.join(recipes, recipeDir, from);
    const dest = path.join(pinnedDir, from);
    if (!existsSync(source)) {
      summary.missing.push(source);
      continue;
    }
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(path.dirname(dest), { recursive: true });
    if (statSync(source).isDirectory()) {
      cpSync(source, dest, { recursive: true, filter: (src) => !skip(src) });
      summary.copied += walkFiles(dest).length;
    } else {
      copyFileSync(source, dest);
      summary.copied += 1;
    }
    keep.push(dest);
  }

  for (const file of walkFiles(pinnedDir)) {
    if (keep.some((root) => isUnder(file, root))) continue;
    rmSync(file);
    summary.removed++;
  }
  removeEmptyDirs(pinnedDir);
  return summary;
}

function main(): void {
  const { recipes } = parseArgs(process.argv.slice(2));
  if (!existsSync(recipes)) {
    throw new Error(`recipes checkout not found at ${recipes}`);
  }
  const catalog = loadCatalog();
  const summaries: Summary[] = [];

  for (const task of catalog.tasks) {
    if (task.recipeDir === null) {
      process.stdout.write(`${task.id}: brief-only, pinned files kept\n`);
      continue;
    }
    const froms = [
      ...new Set(
        [...task.pinnedInputs, ...task.acceptance.files].map((c) => c.from),
      ),
    ];
    summaries.push(importTask(task.id, task.recipeDir, froms, recipes));
  }

  const known = new Set(catalog.tasks.map((t) => t.id));
  const orphans = existsSync(PINNED_ROOT)
    ? readdirSync(PINNED_ROOT).filter((d) => !known.has(d))
    : [];

  let failed = false;
  for (const s of summaries) {
    process.stdout.write(
      `${s.taskId}: copied ${s.copied} file(s), removed ${s.removed}\n`,
    );
    for (const m of s.missing) {
      failed = true;
      process.stdout.write(`  missing source ${m}\n`);
    }
  }
  for (const o of orphans) {
    process.stdout.write(`warning: catalog/pinned/${o} has no task\n`);
  }
  process.stdout.write(`recipes: ${recipes}\npin: ${catalog.pin}\n`);
  if (failed) process.exitCode = 1;
}

main();
