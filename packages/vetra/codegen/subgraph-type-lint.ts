import { loadDocumentModelInDir } from "@powerhousedao/codegen/utils";
import {
  findPackageSubgraphConflicts,
  type PackageSubgraph,
  type PackageSubgraphConflicts,
  type RefusedDocumentModel,
} from "@powerhousedao/reactor-api/subgraph-types";
import { type DocumentNode, parse } from "graphql";
import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Templates with substitutions are skipped: their SDL is only known at runtime.
const GQL_TEMPLATE = /\bgql\s*`([^`]*)`/g;
const SUBGRAPH_NAME = /\bname\s*=\s*["'`]([^"'`]+)["'`]/;
const SUBGRAPH_EXPORT = /from\s+["']\.\/([^/"']+)\/index\.js["']/g;

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

/** Subgraph directories in the order `subgraphs/index.ts` registers them. */
function subgraphDirs(subgraphsDir: string): string[] {
  const exported = Array.from(
    (read(join(subgraphsDir, "index.ts")) ?? "").matchAll(SUBGRAPH_EXPORT),
    ([, dir]) => dir,
  );
  const position = (dir: string) => {
    const index = exported.indexOf(dir);
    return index === -1 ? exported.length : index;
  };
  return directories(subgraphsDir)
    .map((entry) => entry.name)
    .sort((a, b) => position(a) - position(b));
}

function describeRefusal({
  name,
  reason,
  subgraphOnly,
}: RefusedDocumentModel): string {
  const detail = reason.split("\n")[0].replace(/\.$/, "");
  return subgraphOnly
    ? `The subgraph of document model "${name}" is refused by the server: ${detail}.`
    : `Document model "${name}" is refused by the server: ${detail}.`;
}

function describe(name: string, conflict: PackageSubgraphConflicts): string {
  if (conflict.nameHeldBy === "package") {
    return `Subgraph "${name}" is defined more than once, so the server serves only the last. Rename the others.`;
  }
  if (conflict.nameHeldBy) {
    return `Subgraph "${name}" has the name of a ${conflict.nameHeldBy} subgraph, so the server refuses it. Rename the subgraph.`;
  }
  const claims = conflict.claims
    .map(({ claim, owner }) => `${claim} (owned by "${owner}")`)
    .join(", ");
  return `Subgraph "${name}" defines ${claims}, so the supergraph leaves it out. Rename them in its schema.ts.`;
}

/** A warning per model or subgraph the server would refuse or leave out. */
export function lintSubgraphTypes(projectDir: string): string[] {
  const models = directories(join(projectDir, "document-models"))
    .map(loadDocumentModelInDir)
    .filter((model) => model !== undefined);
  const subgraphsDir = join(projectDir, "subgraphs");
  const subgraphs: PackageSubgraph[] = [];
  for (const dir of subgraphDirs(subgraphsDir)) {
    const typeDefs = readSchema(join(subgraphsDir, dir, "schema.ts"));
    if (!typeDefs) continue;
    const index = read(join(subgraphsDir, dir, "index.ts")) ?? "";
    subgraphs.push({ name: SUBGRAPH_NAME.exec(index)?.[1] ?? dir, typeDefs });
  }
  if (subgraphs.length === 0 && models.length === 0) return [];

  const { conflicts, refusedModels } = findPackageSubgraphConflicts(
    subgraphs,
    models,
  );
  return [
    ...refusedModels.map(describeRefusal),
    ...Array.from(conflicts, ([name, conflict]) => describe(name, conflict)),
  ];
}
