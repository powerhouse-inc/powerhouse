import { loadDocumentModelInDir } from "@powerhousedao/codegen/utils";
import {
  findSubgraphTypeConflicts,
  type OwnershipConflict,
} from "@powerhousedao/reactor-api/subgraph-types";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { type DocumentNode, parse } from "graphql";
import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Templates with substitutions are skipped: their SDL is only known at runtime.
const GQL_TEMPLATE = /\bgql\s*`([^`]*)`/g;

function directories(path: string): Dirent[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    );
  } catch {
    return [];
  }
}

function readSchema(path: string): DocumentNode | undefined {
  let source: string;
  try {
    source = readFileSync(path, "utf-8");
  } catch {
    return undefined;
  }
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

function conflictsOf(
  typeDefs: DocumentNode,
  models: DocumentModelGlobalState[],
): OwnershipConflict[] {
  try {
    return findSubgraphTypeConflicts(typeDefs, models);
  } catch {
    // An unparseable model schema fails at generation, and is reported there.
    return [];
  }
}

/** A warning per subgraph whose types or root fields another owns. */
export function lintSubgraphTypes(projectDir: string): string[] {
  const models = directories(join(projectDir, "document-models"))
    .map(loadDocumentModelInDir)
    .filter((model) => model !== undefined);
  const warnings: string[] = [];
  for (const dir of directories(join(projectDir, "subgraphs"))) {
    const typeDefs = readSchema(join(dir.parentPath, dir.name, "schema.ts"));
    if (!typeDefs) continue;
    const conflicts = conflictsOf(typeDefs, models);
    if (conflicts.length === 0) continue;
    const claims = conflicts
      .map(({ claim, owner }) => `${claim} (owned by "${owner}")`)
      .join(", ");
    warnings.push(
      `Subgraph "${dir.name}" defines ${claims}, so the supergraph leaves it out. Rename them in subgraphs/${dir.name}/schema.ts.`,
    );
  }
  return warnings;
}
