import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

/** The one module that reads a model's structured definition. */
const SELECTION_POINT = "tools/model-operations.ts";

function sourcesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourcesIn(join(dir, entry.name))
      : /\.(ts|tsx|mts)$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );
}

const sources = sourcesIn(SRC).map((file) => ({
  path: relative(SRC, file),
  text: readFileSync(file, "utf8"),
}));

describe("reactor-mcp model operations", () => {
  it("inspects definitions only in the selection point", () => {
    expect(
      sources
        .filter(({ text }) => /\binspectDocumentModelDefinition\b/.test(text))
        .map(({ path }) => path),
    ).toEqual([SELECTION_POINT]);
  });

  it("never chooses how to read a model by authoring mode", () => {
    expect(
      sources
        .filter(({ text }) =>
          /\b(definitionSources|DEFAULT_AUTHORING_MODE|parseDefinitionSourcesConfig|authoringMode)\b|compatibility\.(identity|serialization)/.test(
            text,
          ),
        )
        .map(({ path }) => path),
    ).toEqual([]);
  });
});
