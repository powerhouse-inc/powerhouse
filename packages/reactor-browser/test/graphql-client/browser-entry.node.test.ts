import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `@powerhousedao/reactor-browser/graphql-client` is the entry a browser app
 * imports, and it has to bundle with no alias, stub or other build config in
 * Next, Vite or anything else.
 *
 * That holds only while nothing reachable from it imports a node-only package
 * as a VALUE. Type imports are erased before a bundler sees them, so they are
 * free; a single value import is not, because the bundler then has to resolve
 * that package's whole entry. `@powerhousedao/reactor` reaches `pg`,
 * `@electric-sql/pglite` and `node:worker_threads` this way.
 *
 * This walks the entry's transitive import graph and fails with the offending
 * file if that ever regresses. It reads source rather than the build output so
 * it runs without building first.
 */

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const browserEntry = join(packageRoot, "src/graphql-client/entry.ts");

/** Packages a browser bundle must never have to resolve. */
const forbiddenValueImports = [
  "@powerhousedao/reactor",
  "@electric-sql/pglite",
  "kysely",
  "kysely-pglite-dialect",
  "pg",
];

/**
 * Barrels that re-export the world. Reaching either one undoes this entry:
 * the root barrel pulls the reactor back in, and the hooks barrel roughly
 * doubles the graph and adds `@renown/sdk`, `zod` and `lz-string`.
 */
const forbiddenBarrels = ["index.ts", "src/hooks/index.ts"];

const importFrom =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([\s\S]*?)\bfrom\s+["']([^"']+)["']/g;
const bareImport = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;

function resolveRelative(specifier: string, importer: string) {
  const base = resolve(dirname(importer), specifier);
  const withoutJs = base.replace(/\.js$/, "");
  const candidates = [
    `${withoutJs}.ts`,
    `${withoutJs}.tsx`,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

type Offender = { file: string; specifier: string };

function walk(entry: string) {
  const files = new Set<string>();
  const valueImports: Offender[] = [];
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || files.has(file) || !existsSync(file)) continue;
    files.add(file);
    const source = readFileSync(file, "utf8");

    for (const match of source.matchAll(importFrom)) {
      const [, typeKeyword, clause, specifier] = match;
      // `import type { … } from` / `export type { … } from` is erased whole.
      const wholeStatementIsType = Boolean(typeKeyword);
      if (specifier.startsWith(".")) {
        if (wholeStatementIsType) continue;
        const resolved = resolveRelative(specifier, file);
        if (resolved) queue.push(resolved);
        continue;
      }
      // An inline-`type` specifier is erased too; the statement is only a value
      // import if at least one specifier is not marked `type`.
      const specifiers = clause.replace(/[{}]/g, " ").split(",");
      const importsAValue =
        !wholeStatementIsType &&
        specifiers.some((name) => {
          const trimmed = name.trim();
          return trimmed.length > 0 && !trimmed.startsWith("type ");
        });
      if (importsAValue) valueImports.push({ file, specifier });
    }

    for (const match of source.matchAll(bareImport)) {
      const specifier = match[1];
      if (specifier.startsWith(".")) {
        const resolved = resolveRelative(specifier, file);
        if (resolved) queue.push(resolved);
      } else {
        valueImports.push({ file, specifier });
      }
    }
  }

  return { files, valueImports };
}

describe("the browser entry point", () => {
  const { files, valueImports } = walk(browserEntry);

  it("reaches the light client without walking the whole package", () => {
    // Guards against someone re-exporting from a barrel: the number is a
    // budget, not a target. Raise it deliberately, never to make it pass.
    expect(files.size).toBeGreaterThan(0);
    expect(files.size).toBeLessThan(80);
  });

  it("never imports a node-only package as a value", () => {
    const offenders = valueImports
      .filter(({ specifier }) =>
        forbiddenValueImports.some(
          (forbidden) =>
            specifier === forbidden || specifier.startsWith(`${forbidden}/`),
        ),
      )
      .map(
        ({ file, specifier }) =>
          `${relative(packageRoot, file)} -> ${specifier}`,
      );

    expect(offenders).toEqual([]);
  });

  it("never imports a node built-in as a value", () => {
    const offenders = valueImports
      .filter(({ specifier }) => specifier.startsWith("node:"))
      .map(
        ({ file, specifier }) =>
          `${relative(packageRoot, file)} -> ${specifier}`,
      );

    expect(offenders).toEqual([]);
  });

  it("never reaches a barrel that re-exports the world", () => {
    const reached = [...files]
      .map((file) => relative(packageRoot, file))
      .filter((file) => forbiddenBarrels.includes(file));

    expect(reached).toEqual([]);
  });
});
