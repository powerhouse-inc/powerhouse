// The published build must agree with itself: a name dist/*.d.ts presents as a
// value has to exist in dist/*.js, or `import { X }` typechecks and fails at link.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Node, Project, SymbolFlags } from "ts-morph";
import { describe, expect, it } from "vitest";

const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);

// Export names the d.ts presents as values, honouring `export type`.
function valueExports(dtsFile: string): string[] {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { types: [] },
  });
  const file = project.addSourceFileAtPath(dtsFile);
  project.resolveSourceFileDependencies();
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

async function runtimeExports(jsFile: string): Promise<string[]> {
  const module = (await import(
    /* @vite-ignore */ pathToFileURL(jsFile).href
  )) as Record<string, unknown>;
  return Object.keys(module).sort();
}

describe.each(["index", "common"])("dist/%s", (entry) => {
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
});
