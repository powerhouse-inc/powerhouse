import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const SCHEMA_DIR = join(SRC, "graphql/document-model-schema");
const SELECTION_POINT = "graphql/document-model-schema/source.ts";

function sourcesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourcesIn(join(dir, entry.name))
      : /\.m?ts$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );
}

/** Static, side-effect, re-export and dynamic import specifiers. */
function specifiersOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [
    ...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g),
  ].map((match) => match[1]);
}

/** The src file a relative specifier names, if any. */
function resolveRelative(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const target = resolve(dirname(from), specifier);
  return [target, target.replace(/\.js$/, ".ts"), `${target}.ts`].find(
    (path) => path.startsWith(SRC) && existsSync(path) && path.endsWith(".ts"),
  );
}

const fromSrc = (path: string) => relative(SRC, path);

describe("document-model schema boundaries", () => {
  const files = sourcesIn(SRC);

  it("selects a model's schema source in source.ts alone", () => {
    const offenders = files
      .filter((file) =>
        /\b(inspectDocumentModelDefinition|projectDocumentModelGraphQL)\b/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map(fromSrc)
      .filter((path) => path !== SELECTION_POINT);
    expect(offenders).toEqual([]);
  });

  it("builds schemas without reaching create-schema or a subgraph", () => {
    const seen = new Set<string>();
    const queue = sourcesIn(SCHEMA_DIR).map((file) => ({
      file,
      via: [fromSrc(file)],
    }));
    const offenders: string[] = [];
    while (queue.length > 0) {
      const { file, via } = queue.shift()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const path = fromSrc(file);
      if (path === "utils/create-schema.ts" || /subgraph/i.test(path)) {
        offenders.push(via.join(" -> "));
        continue;
      }
      for (const specifier of specifiersOf(file)) {
        if (specifier.startsWith("@powerhousedao/reactor-api")) {
          offenders.push([...via, specifier].join(" -> "));
        }
        const target = resolveRelative(file, specifier);
        if (target !== undefined) {
          queue.push({ file: target, via: [...via, fromSrc(target)] });
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never chooses a schema source by authoring mode", () => {
    const offenders = files
      .filter((file) =>
        /\b(definitionSources|DEFAULT_AUTHORING_MODE|parseDefinitionSourcesConfig|authoringMode)\b|compatibility\.(identity|serialization)/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map(fromSrc);
    expect(offenders).toEqual([]);
  });
});
