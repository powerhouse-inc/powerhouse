import { loadDocumentModelInDir } from "@powerhousedao/codegen/utils";
import {
  describeClaimContest,
  describeRefusedDocumentModel,
  describeSubgraphConflict,
  findPackageSubgraphConflicts,
  hostDocumentModels,
  type PackageSubgraph,
  quotedNames,
  type SubgraphWarning,
} from "@powerhousedao/reactor-api/subgraph-types";
import { type DocumentNode, parse } from "graphql";
import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Templates with substitutions are skipped: their SDL is only known at runtime.
const GQL_TEMPLATE = /\bgql\s*`([^`]*)`/g;
const SUBGRAPH_NAME = /\bname\s*=\s*["'`]([^"'`]+)["'`]/;

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

const line = ({ message, repair }: SubgraphWarning) => `${message} ${repair}`;

/** A warning per model and subgraph the server would refuse or leave out. */
export function lintSubgraphTypes(projectDir: string): string[] {
  const models = directories(join(projectDir, "document-models"))
    .map(loadDocumentModelInDir)
    .filter((model) => model !== undefined);
  const subgraphsDir = join(projectDir, "subgraphs");
  const subgraphs: PackageSubgraph[] = [];
  const dirOf = new Map<PackageSubgraph, string>();
  const dirs = directories(subgraphsDir)
    .map((entry) => entry.name)
    .sort();
  for (const dir of dirs) {
    const typeDefs = readSchema(join(subgraphsDir, dir, "schema.ts"));
    if (!typeDefs) continue;
    const index = read(join(subgraphsDir, dir, "index.ts")) ?? "";
    const subgraph = { name: SUBGRAPH_NAME.exec(index)?.[1] ?? dir, typeDefs };
    subgraphs.push(subgraph);
    dirOf.set(subgraph, dir);
  }
  if (subgraphs.length === 0) return [];

  const host = hostDocumentModels(models);
  const { conflicts, contests, duplicateNames } = findPackageSubgraphConflicts(
    subgraphs,
    host,
  );
  return [
    ...host.refused.map((model) => line(describeRefusedDocumentModel(model))),
    ...duplicateNames.map((name) => {
      const dirs = subgraphs
        .filter((subgraph) => subgraph.name === name)
        .map((subgraph) => dirOf.get(subgraph) ?? name);
      return `Subgraphs in ${quotedNames(dirs)} are ${dirs.length === 2 ? "both" : "all"} named "${name}", so the server serves only one of them. Rename ${dirs.length === 2 ? "one" : "all but one"} of them.`;
    }),
    ...Array.from(conflicts).flatMap(([{ name }, conflict]) =>
      describeSubgraphConflict(name, conflict).map(line),
    ),
    ...contests.map((contest) => line(describeClaimContest(contest))),
  ];
}
