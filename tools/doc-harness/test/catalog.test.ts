import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadCatalog,
  pinnedPath,
  validateCatalogFiles,
  type Task,
} from "../src/lib/catalog.js";
import { MONOREPO_ROOT, recipesRoot } from "../src/lib/paths.js";

const catalog = loadCatalog();
const recipes = recipesRoot();
const recipesPresent = existsSync(recipes);

/** Dev dependencies every scaffolded workspace gets regardless of task. */
const SCAFFOLD_DEV_DEPS = ["vitest", "typescript", "tsx", "@types/node"];

function exportPattern(name: string): RegExp {
  const declared = `export\\s+(?:declare\\s+)?(?:abstract\\s+)?(?:async\\s+)?(?:class|function\\*?|const|let|var|type|interface|enum)\\s+${name}\\b`;
  const listed = `export\\s*(?:type\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}`;
  return new RegExp(`${declared}|${listed}`);
}

function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  const fromRe = /(?:import|export)\b[^'"]*?\bfrom\s*["']([^"']+)["']/g;
  const bareRe = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  for (const m of source.matchAll(fromRe)) out.push(m[1]);
  for (const m of source.matchAll(bareRe)) out.push(m[1]);
  return out;
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function stripExtension(p: string): string {
  return p.replace(/\.(?:js|ts|mjs|mts)$/, "");
}

function contractFiles(task: Task): Set<string> {
  return new Set(task.contract.map((c) => stripExtension(c.file)));
}

function allowedPackages(task: Task): Set<string> {
  return new Set([
    ...task.packages,
    ...Object.keys(task.extraDeps),
    ...SCAFFOLD_DEV_DEPS,
  ]);
}

describe("catalog", () => {
  it("has no structural problems", () => {
    expect(validateCatalogFiles(catalog)).toEqual([]);
    expect(catalog.tasks.length).toBeGreaterThan(0);
  });

  it("names only ph-lora doc sections", () => {
    const mapping = JSON.parse(
      readFileSync(
        path.join(MONOREPO_ROOT, "test/ph-lora/ph-lora-mapping.json"),
        "utf8",
      ),
    ) as { sections: { id: string }[] };
    const ids = new Set(mapping.sections.map((s) => s.id));
    for (const task of catalog.tasks) {
      for (const section of task.docSections) {
        expect(ids, `${task.id}: ${section}`).toContain(section);
      }
    }
  });

  it("keeps brief-only tasks out of arm B", () => {
    for (const task of catalog.tasks.filter((t) => t.recipeDir === null)) {
      expect(task.arms, task.id).not.toContain("B");
      expect(task.brief, task.id).not.toBeNull();
    }
  });

  it("has every contract export in the recipe source", (ctx) => {
    if (!recipesPresent) {
      ctx.skip(`recipes checkout absent at ${recipes}`);
    }
    for (const task of catalog.tasks) {
      if (task.recipeDir === null) continue;
      for (const entry of task.contract) {
        const file = path.join(recipes, task.recipeDir, entry.file);
        expect(existsSync(file), `${task.id}: ${file}`).toBe(true);
        const source = readFileSync(file, "utf8");
        for (const name of entry.exports) {
          expect(
            exportPattern(name).test(source),
            `${task.id}: ${entry.file} does not export ${name}`,
          ).toBe(true);
        }
      }
    }
  });

  it("acceptance tests import only published packages, the contract, or document-models", () => {
    for (const task of catalog.tasks) {
      const contract = contractFiles(task);
      const packages = allowedPackages(task);
      const tests = task.acceptance.files.filter((f) =>
        /\.test\.[cm]?ts$/.test(f.to),
      );
      if (task.acceptance.kind === "vitest") {
        expect(tests.length, `${task.id}: no test files`).toBeGreaterThan(0);
      }
      for (const file of tests) {
        const source = readFileSync(pinnedPath(task.id, file.from), "utf8");
        const specifiers = importSpecifiers(source);
        expect(specifiers.length, `${task.id}: ${file.to}`).toBeGreaterThan(0);
        for (const spec of specifiers) {
          const label = `${task.id}: ${file.to} imports ${spec}`;
          if (spec.startsWith(".")) {
            const resolved = stripExtension(
              path.posix.normalize(
                path.posix.join(path.posix.dirname(file.to), spec),
              ),
            );
            expect(contract, label).toContain(resolved);
          } else if (
            spec === "document-models" ||
            spec.startsWith("document-models/")
          ) {
            const pinsModels = task.pinnedInputs.some(
              (p) =>
                p.to === "document-models" ||
                p.to.startsWith("document-models/"),
            );
            expect(pinsModels, label).toBe(true);
          } else {
            expect(packages, label).toContain(packageName(spec));
          }
        }
      }
    }
  });
});
