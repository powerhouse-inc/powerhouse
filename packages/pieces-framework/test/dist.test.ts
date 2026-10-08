// The published build must agree with itself: a name dist/*.d.ts presents as a
// value has to exist in dist/*.js, or `import { X }` typechecks and fails at link.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Node, Project, SymbolFlags } from "ts-morph";
import { describe, expect, it } from "vitest";

const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);

// Only dist's own declarations: peers are type-only, and resolving them
// parses hundreds of files.
const project = new Project({
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { types: [], noResolve: true },
});
project.addSourceFilesAtPaths(path.join(dist, "*.d.ts"));

// Export names the d.ts presents as values, honouring `export type`.
function valueExports(dtsFile: string): string[] {
  const file = project.getSourceFileOrThrow(dtsFile);
  const names: string[] = [];
  for (const symbol of file.getExportSymbols()) {
    const declaration = symbol.getDeclarations()[0];
    if (
      Node.isExportSpecifier(declaration) &&
      (declaration.isTypeOnly() ||
        declaration.getExportDeclaration().isTypeOnly())
    ) {
      continue;
    }
    const target = symbol.getAliasedSymbol() ?? symbol;
    if (target.getFlags() & SymbolFlags.Value) names.push(symbol.getName());
  }
  return names.sort();
}

// Package names behind the bare specifiers a built file imports.
function externalImports(jsFile: string): string[] {
  const source = readFileSync(jsFile, "utf8");
  const specifiers = [
    ...source.matchAll(
      /^(?:import|export)\b[^\n;]*?\bfrom\s*["']([^"']+)["']/gm,
    ),
    ...source.matchAll(/^import\s*["']([^"']+)["']/gm),
    ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].flatMap((match) => match.slice(1, 2));
  const packages = new Set<string>();
  for (const specifier of specifiers) {
    if (specifier.startsWith(".") || specifier.startsWith("node:")) continue;
    const name = /^(@[^/]+\/[^/]+|[^/]+)/.exec(specifier)?.[1];
    if (name) packages.add(name);
  }
  return [...packages].sort();
}

async function runtimeExports(jsFile: string): Promise<string[]> {
  const module = (await import(
    /* @vite-ignore */ pathToFileURL(jsFile).href
  )) as Record<string, unknown>;
  return Object.keys(module).sort();
}

describe.each(["index", "common", "host", "block-type", "workflow"])(
  "dist/%s",
  (entry) => {
    const js = path.join(dist, `${entry}.js`);
    const dts = path.join(dist, `${entry}.d.ts`);

    it("is built (run `pnpm build` first)", () => {
      expect(existsSync(js) && existsSync(dts)).toBe(true);
    });

    it("declares no value the runtime lacks", async () => {
      const runtime = await runtimeExports(js);
      const claimed = valueExports(dts);
      expect(claimed.length).toBeGreaterThan(0);
      expect(claimed.filter((name) => !runtime.includes(name))).toEqual([]);
    });
  },
);

describe("dist", () => {
  it("imports exactly the declared dependencies", () => {
    const { dependencies } = JSON.parse(
      readFileSync(path.join(dist, "../package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    const imported = readdirSync(dist)
      .filter((file) => file.endsWith(".js"))
      .flatMap((file) => externalImports(path.join(dist, file)));
    expect([...new Set(imported)].sort()).toEqual(
      Object.keys(dependencies).sort(),
    );
  });

  // Type-only peers: the declarations import them, the runtime never does.
  it("takes the reactor clients' types from peers, not a bundled copy", () => {
    const { peerDependencies, dependencies } = JSON.parse(
      readFileSync(path.join(dist, "../package.json"), "utf8"),
    ) as {
      peerDependencies: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(Object.keys(peerDependencies)).toContain("@powerhousedao/reactor");
    expect(Object.keys(dependencies)).not.toContain("@powerhousedao/reactor");
    const declarations = readdirSync(dist)
      .filter((file) => file.endsWith(".d.ts"))
      .map((file) => readFileSync(path.join(dist, file), "utf8"))
      .join("\n");
    expect(declarations).toMatch(
      /import \{[^}]*\bIReactorClient\b[^}]*\} from "@powerhousedao\/reactor"/,
    );
    expect(declarations).not.toMatch(/interface IReactorClient\b/);
  });

  // The editor bundles it for the browser.
  it.each(["block-type", "workflow"])("%s imports nothing at all", (entry) => {
    const source = readFileSync(path.join(dist, `${entry}.js`), "utf8");
    expect(source).not.toMatch(/^\s*(import|export)\b[^\n;]*\bfrom\s*["']/m);
    expect(source).not.toMatch(/\bimport\(|\brequire\(/);
  });
});
