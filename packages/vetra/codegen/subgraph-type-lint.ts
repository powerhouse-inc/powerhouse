import { loadDocumentModelInDir } from "@powerhousedao/codegen/utils";
import {
  buildPackageSubgraph,
  type CodeFirstSubgraph,
  findPackageSubgraphFindings,
  type LabeledSubgraph,
  readCodeFirstSubgraph,
} from "@powerhousedao/reactor-api/subgraph-types";
import type {
  DefinitionSource,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import type {
  HostValidationRequest,
  LoadedDefinition,
  SchemaFirstSubgraph,
  SubgraphClass,
} from "document-model/tooling";
import { type DocumentNode, parse } from "graphql";
import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Templates with substitutions are skipped: their SDL is only known at runtime.
const GQL_TEMPLATE = /\bgql\s*`([^`]*)`/g;
const SUBGRAPH_NAME = /\bname\s*=\s*["'`]([^"'`]+)["'`]/;
// A code-first subgraph read here was not loaded, so take the name it declares.
// Only a literal `name` before any nested object is found, as scaffolds write it.
const DEFINED_SUBGRAPH_NAME =
  /\bdefineSubgraph\s*(?:<[^>]*>)?\s*\(\s*\{[^{}]*?\bname\s*:\s*["'`]([^"'`]+)["'`]/;

function directories(path: string): Dirent[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    );
  } catch {
    return [];
  }
}

function read(path: string): string | undefined {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return undefined;
  }
}

function readSchema(path: string): DocumentNode | undefined {
  const source = read(path);
  if (source === undefined) return undefined;
  const blocks = Array.from(source.matchAll(GQL_TEMPLATE), ([, sdl]) => sdl);
  if (blocks.length === 0 || blocks.some((sdl) => sdl.includes("${"))) {
    return undefined;
  }
  try {
    return parse(blocks.join("\n"));
  } catch {
    // Invalid SDL fails where the subgraph loads, and is reported there.
    return undefined;
  }
}

type SchemaFirst = NonNullable<HostValidationRequest["schemaFirst"]>;

/**
 * The models under `document-models/`. A model file that is not JSON throws,
 * unless `skipUnreadable` leaves that model out.
 */
export function readSchemaFirstModels(
  projectDir: string,
  { skipUnreadable = false }: { readonly skipUnreadable?: boolean } = {},
): SchemaFirst["documentModels"] {
  return directories(join(projectDir, "document-models")).flatMap((dir) => {
    try {
      return loadDocumentModelInDir(dir) ?? [];
    } catch (error) {
      if (skipUnreadable) return [];
      throw error;
    }
  });
}

/**
 * The subgraphs under `subgraphs/<dir>/`, except the directories the given
 * code-first subgraphs were loaded from.
 */
export function readSchemaFirstSubgraphs(
  projectDir: string,
  codeFirst: readonly { readonly source: DefinitionSource }[],
): SchemaFirst["subgraphs"] {
  const subgraphsDir = join(projectDir, "subgraphs");
  const codeFirstDirs = new Set(
    codeFirst.flatMap(
      ({ source }) =>
        /^\.\/subgraphs\/([^/]+)\//.exec(source.specifier)?.[1] ?? [],
    ),
  );
  const dirs = directories(subgraphsDir)
    .map((entry) => entry.name)
    .filter((dir) => !codeFirstDirs.has(dir))
    .sort();
  const subgraphs: SchemaFirstSubgraph[] = [];
  for (const dir of dirs) {
    const typeDefs = readSchema(join(subgraphsDir, dir, "schema.ts"));
    if (!typeDefs) continue;
    const index = read(join(subgraphsDir, dir, "index.ts")) ?? "";
    subgraphs.push({
      name:
        SUBGRAPH_NAME.exec(index)?.[1] ??
        DEFINED_SUBGRAPH_NAME.exec(index)?.[1] ??
        dir,
      typeDefs,
      label: dir,
      source: { specifier: `./subgraphs/${dir}/schema.ts` },
    });
  }
  return subgraphs;
}

type Subject = LabeledSubgraph & {
  readonly scalarResolvers?: CodeFirstSubgraph["scalarResolvers"];
};

/**
 * A warning per model and subgraph the server would refuse or leave out,
 * across the project's schema-first package and its code-first selection.
 */
export function lintSubgraphTypes(
  projectDir: string,
  codeFirst?: {
    readonly documentModels: readonly DocumentModelModule[];
    readonly subgraphs: readonly LoadedDefinition<SubgraphClass>[];
  },
): string[] {
  const documentModels = readSchemaFirstModels(projectDir);
  const subgraphs: Subject[] = [
    ...readSchemaFirstSubgraphs(projectDir, codeFirst?.subgraphs ?? []),
  ];
  for (const entry of codeFirst?.subgraphs ?? []) {
    const subgraph = readCodeFirstSubgraph(entry);
    if (subgraph?.typeDefs) {
      subgraphs.push({ ...subgraph, typeDefs: subgraph.typeDefs });
    }
  }
  return findPackageSubgraphFindings(
    [...documentModels, ...(codeFirst?.documentModels ?? [])],
    subgraphs,
    (subgraph, host) =>
      buildPackageSubgraph(subgraph, host, {
        resolvers: subgraph.scalarResolvers,
        reportScalars: false,
      }),
  ).map(({ message, repair }) => `${message} ${repair}`);
}
