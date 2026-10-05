import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as runtime from "./index.js";

/**
 * The `@powerhousedao/workflow/editors/runtime` entry is the standalone slice
 * Workflow Studio shares with the Reactor Monitor. Two things have to hold: it
 * exposes the runtime client and its record types / query factories, and its
 * import graph drags in neither `@powerhousedao/design-system` nor any React
 * view -- otherwise a non-Connect consumer pulls the whole studio in behind it.
 */

const here = dirname(fileURLToPath(import.meta.url));

describe("the standalone runtime entry", () => {
  it("surfaces the client, record types and query factories", () => {
    expect(typeof runtime.createRuntimeClient).toBe("function");
    expect(typeof runtime.createRuntimeQueryClient).toBe("function");
    expect(typeof runtime.runsQuery).toBe("function");
    expect(typeof runtime.runPagesQuery).toBe("function");
    expect(typeof runtime.runQuery).toBe("function");
    expect(typeof runtime.runsOfPages).toBe("function");
    expect(typeof runtime.fetchRunsPage).toBe("function");
    expect(typeof runtime.fetchRun).toBe("function");
  });

  it("leaves the Connect-bound view components out of the entry", () => {
    for (const view of ["WorkflowStudio", "WorkflowHeader", "RunsTable"]) {
      expect(runtime).not.toHaveProperty(view);
    }
  });

  it("drags in neither the design system nor a React view", () => {
    const graph = crawl(resolve(here, "index.ts"));
    const designSystem = graph.bare.filter((spec) =>
      spec.startsWith("@powerhousedao/design-system"),
    );
    expect(designSystem).toEqual([]);
    const views = graph.files.filter(
      (file) => file.endsWith(".tsx") || file.includes("workflow-studio"),
    );
    expect(views).toEqual([]);
  });
});

/** The relative modules an entry reaches, and the bare specifiers it imports. */
type ImportGraph = { files: string[]; bare: string[] };

const SPECIFIER = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function specifiersOf(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(SPECIFIER)) {
    found.push(match[1]);
  }
  return found;
}

/** Maps a `.js` relative import back to the `.ts(x)` source it is emitted from. */
function resolveRelative(fromDir: string, spec: string): string | undefined {
  const base = resolve(fromDir, spec.replace(/\.js$/, ""));
  const candidates = [`${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")];
  return candidates.find((candidate) => existsSync(candidate));
}

/** Walks the relative-import graph from an entry, recording what it touches. */
function crawl(entry: string): ImportGraph {
  const files: string[] = [];
  const bare = new Set<string>();
  const pending = [entry];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || seen.has(file)) {
      continue;
    }
    seen.add(file);
    if (file !== entry) {
      files.push(file);
    }
    for (const spec of specifiersOf(readFileSync(file, "utf8"))) {
      if (spec.startsWith(".")) {
        const next = resolveRelative(dirname(file), spec);
        if (next) {
          pending.push(next);
        }
        continue;
      }
      bare.add(spec);
    }
  }
  return { files, bare: [...bare] };
}
