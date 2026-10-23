import { loadDocumentModelInDir } from "@powerhousedao/codegen/utils";
import {
  findPackageSubgraphConflicts,
  type PackageSubgraph,
  type PackageSubgraphConflicts,
  type RefusedDocumentModel,
} from "@powerhousedao/reactor-api/subgraph-types";
import { kebabCase } from "change-case";
import { type DocumentNode, Kind, parse } from "graphql";
import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
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

function loadModels(projectDir: string) {
  return directories(join(projectDir, "document-models"))
    .map(loadDocumentModelInDir)
    .filter((model) => model !== undefined);
}

/** Why the server would refuse a new subgraph scaffolded as `name`, if it
 * would; an existing one is left to {@link lintSubgraphTypes}. */
export async function findSubgraphNameConflict(
  projectDir: string,
  name: string,
): Promise<string | undefined> {
  const subgraphName = kebabCase(name);
  if (existsSync(join(projectDir, "subgraphs", subgraphName, "index.ts"))) {
    return undefined;
  }
  const { conflicts } = await findPackageSubgraphConflicts(
    [
      {
        name: subgraphName,
        typeDefs: { kind: Kind.DOCUMENT, definitions: [] },
      },
    ],
    loadModels(projectDir),
  );
  const holder = conflicts.get(subgraphName)?.nameHeldBy;
  if (!holder || holder === "package") return undefined;
  return `Subgraph name "${subgraphName}" is taken by a ${holder} subgraph, so the server would refuse this one. Choose another name, such as "${subgraphName}-api".`;
}

/** A warning per model or subgraph the server would refuse or leave out. */
export async function lintSubgraphTypes(projectDir: string): Promise<string[]> {
  const models = loadModels(projectDir);
  const subgraphsDir = join(projectDir, "subgraphs");
  const subgraphs: PackageSubgraph[] = [];
  for (const dir of subgraphDirs(subgraphsDir)) {
    const typeDefs = readSchema(join(subgraphsDir, dir, "schema.ts"));
    if (!typeDefs) continue;
    const index = read(join(subgraphsDir, dir, "index.ts")) ?? "";
    subgraphs.push({ name: SUBGRAPH_NAME.exec(index)?.[1] ?? dir, typeDefs });
  }
  if (subgraphs.length === 0 && models.length === 0) return [];

  const { conflicts, refusedModels } = await findPackageSubgraphConflicts(
    subgraphs,
    models,
  );
  return [
    ...refusedModels.map(describeRefusal),
    ...Array.from(conflicts, ([name, conflict]) => describe(name, conflict)),
  ];
}
