import { loadDocumentModelInDir } from "@powerhousedao/codegen/utils";
import {
  findPackageSubgraphConflicts,
  isRootFieldClaim,
  type OwnershipConflict,
  quotedNames,
  type PackageSubgraph,
  type PackageSubgraphConflicts,
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

const listClaims = (claims: readonly OwnershipConflict[]) =>
  claims.map(({ claim, owner }) => `${claim} (owned by "${owner}")`).join(", ");

/** The warnings for one subgraph, except the claims it contests. */
function describe(name: string, conflict: PackageSubgraphConflicts): string[] {
  switch (conflict.kind) {
    case "name":
      return [
        `Subgraph "${name}" has the name of a ${conflict.heldBy} subgraph, so the server refuses it. Rename the subgraph.`,
      ];
    case "generated":
      return [
        `Subgraph "${name}" defines ${listClaims(conflict.claims)}, so the server refuses it. Rename them in its schema.ts.`,
      ];
    case "claims": {
      const owned = conflict.claims.flatMap((claim) =>
        claim.kind === "owned" ? [claim] : [],
      );
      return owned.length === 0
        ? []
        : [
            `Subgraph "${name}" defines ${listClaims(owned)}, so the supergraph leaves it out. Rename them in its schema.ts.`,
          ];
    }
  }
}

/**
 * One warning per contested claim. A root field names every subgraph that
 * declares it. A type groups its claimants by definition: subgraphs with the
 * same rivals define it the same way.
 */
function describeContests(
  conflicts: ReadonlyMap<PackageSubgraph, PackageSubgraphConflicts>,
): string[] {
  const rivalsByClaim = new Map<string, Map<string, readonly string[]>>();
  for (const [{ name }, conflict] of conflicts) {
    if (conflict.kind !== "claims") continue;
    for (const lost of conflict.claims) {
      if (lost.kind !== "contested") continue;
      const holders =
        rivalsByClaim.get(lost.claim) ?? new Map<string, readonly string[]>();
      holders.set(name, lost.rivals);
      rivalsByClaim.set(lost.claim, holders);
    }
  }
  return Array.from(rivalsByClaim, ([claim, holders]) => {
    const names = [...holders.keys()].sort();
    if (isRootFieldClaim(claim)) {
      return `Subgraphs ${quotedNames(names)} ${names.length === 2 ? "both" : "all"} define ${claim}, and only the one that registers first keeps it in the supergraph. Rename it in all but one of them.`;
    }
    const groups = Map.groupBy(names, (name) =>
      [...(holders.get(name) ?? [])].sort().join("\n"),
    );
    const ways = Array.from(
      groups.values(),
      (group, index) =>
        `${index === 0 ? "one way" : "another way"} by ${quotedNames(group)}`,
    );
    return `${claim} is defined ${ways.slice(0, -1).join(", ")}, and ${ways.at(-1)}. The supergraph keeps it only in the subgraphs that define it as the first one to register does. Make the definitions identical, or rename it where it differs.`;
  });
}

/** A warning per subgraph the server would refuse or leave out. */
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

  const { conflicts, duplicateNames, skippedModels } =
    findPackageSubgraphConflicts(subgraphs, models);
  return [
    ...skippedModels.map(
      (name) =>
        `Document model "${name}" was left out of the subgraph check: its schema does not generate.`,
    ),
    ...duplicateNames.map((name) => {
      const dirs = subgraphs
        .filter((subgraph) => subgraph.name === name)
        .map((subgraph) => dirOf.get(subgraph) ?? name);
      return `Subgraphs in ${quotedNames(dirs)} are ${dirs.length === 2 ? "both" : "all"} named "${name}", so the server serves only one of them. Rename ${dirs.length === 2 ? "one" : "all but one"} of them.`;
    }),
    ...Array.from(conflicts).flatMap(([{ name }, conflict]) =>
      describe(name, conflict),
    ),
    ...describeContests(conflicts),
  ];
}
