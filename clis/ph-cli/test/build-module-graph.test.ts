// A schema-first `ph build` must not load the definition loader, codegen or
// the release checks: the definitions step imports them past its gate.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");

// Value imports and re-exports at the start of a line; `import type` is erased.
const STATIC_IMPORT =
  /^(?:import|export)\s+(?!type\b)(?:[^;'"`]*?\sfrom\s+)?["']([^"']+)["']/gm;

function sourceFile(from: string, specifier: string): string {
  const base = resolve(dirname(from), specifier).replace(/\.js$/, "");
  const found = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(
    existsSync,
  );
  if (found === undefined) throw new Error(`${specifier} from ${from}`);
  return found;
}

/** Every ph-cli module and every package `entry` imports statically. */
function staticImports(entry: string): {
  modules: string[];
  packages: string[];
} {
  const modules = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string) => {
    if (modules.has(file)) return;
    modules.add(file);
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(
      STATIC_IMPORT,
    )) {
      if (specifier.startsWith(".")) visit(sourceFile(file, specifier));
      else packages.add(specifier);
    }
  };
  visit(join(SRC, entry));
  return {
    modules: [...modules].map((file) => relative(SRC, file)).sort(),
    packages: [...packages].sort(),
  };
}

const DEFINITION_MODULES = [
  join("services", "model", "project.ts"),
  join("services", "model", "render.ts"),
  join("services", "release", "evidence.ts"),
];
const DEFINITION_PACKAGES = [
  "@powerhousedao/codegen/utils",
  "@powerhousedao/reactor-api",
  "document-model/tooling",
];

describe("the modules a build loads before its definitions step", () => {
  it("leave out the definition loader, codegen and the release checks", () => {
    const build = staticImports(join("services", "build.ts"));

    expect(build.modules).toContain(
      join("services", "package-build", "steps", "definitions.ts"),
    );
    expect(build.packages).toContain("tsdown");
    expect(
      DEFINITION_MODULES.filter((file) => existsSync(join(SRC, file))),
    ).toEqual(DEFINITION_MODULES);
    expect(
      build.modules.filter((file) => DEFINITION_MODULES.includes(file)),
    ).toEqual([]);
    expect(
      build.packages.filter((name) => DEFINITION_PACKAGES.includes(name)),
    ).toEqual([]);
  });
});
