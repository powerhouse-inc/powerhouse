import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("scalar subpath", () => {
  it("exposes exactly the catalog and definition runtime API", async () => {
    const exports = await import("../../scalars.js");
    expect(Object.keys(exports).sort()).toEqual([
      "SCALAR_DEFINITION_VERSION",
      "defineScalar",
      "documentModelScalars",
      "getCatalogScalar",
      "isScalarDefinition",
      "scalarCatalog",
      "scalarDefinitionVersion",
    ]);
  });

  it("imports only zod through the built entry and its local chunks", () => {
    const entry = fileURLToPath(
      new URL("../../dist/scalars.js", import.meta.url),
    );
    const seen = new Set<string>();
    const external = new Set<string>();
    function visit(file: string) {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      const imports = source.matchAll(
        /\b(?:import|export)\s*(?:[^"'()]*?\s+from\s*|\(\s*)?["']([^"']+)["']/g,
      );
      for (const match of imports) {
        const specifier = match[1];
        if (!specifier) throw new Error("Missing import specifier");
        if (specifier.startsWith(".")) visit(resolve(dirname(file), specifier));
        else external.add(specifier);
      }
    }
    visit(entry);
    expect([...external]).toEqual(["zod"]);
  });
});
