import type { SchemaFirstSubgraphSource } from "document-model/tooling";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SDL_FILES: readonly (readonly [
  string,
  SchemaFirstSubgraphSource["language"],
])[] = [
  ["schema.graphql", "graphql"],
  ["schema.ts", "typescript"],
  ["index.ts", "typescript"],
];

const LITERAL_NAME = /\bname(?:\s*:\s*string)?\s*=\s*["'`]([^"'`$]+)["'`]/;

function readText(path: string): string | null {
  if (!(statSync(path, { throwIfNoEntry: false })?.isFile() ?? false)) {
    return null;
  }
  return readFileSync(path, "utf8");
}

export function schemaFirstSource(
  projectRoot: string,
  dir: string,
): SchemaFirstSubgraphSource {
  const unit = `./subgraphs/${dir}/` as const;
  const index = readText(join(projectRoot, "subgraphs", dir, "index.ts"));
  const name = index?.match(LITERAL_NAME)?.[1] ?? null;
  for (const [file, language] of SDL_FILES) {
    const text = readText(join(projectRoot, "subgraphs", dir, file));
    if (text !== null) {
      return {
        unit,
        name,
        source: { specifier: `${unit}${file}` },
        language,
        text,
      };
    }
  }
  return {
    unit,
    name,
    source: { specifier: `${unit}index.ts` },
    language: "typescript",
    text: null,
  };
}
