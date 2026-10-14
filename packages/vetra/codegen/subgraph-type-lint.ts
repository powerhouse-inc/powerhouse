import { loadDocumentModelInDir } from "@powerhousedao/codegen/utils";
import {
  findPackageSubgraphConflicts,
  isRootFieldClaim,
  type OwnershipConflict,
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

/** `"a" and "b"`, or `"a", "b" and "c"`. */
const quotedList = (names: readonly string[]) => {
  const quoted = names.map((name) => `"${name}"`);
  return `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
};

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

/** One warning per contested claim, naming every subgraph that declares it. */
function describeContests(
  conflicts: ReadonlyMap<string, PackageSubgraphConflicts>,
): string[] {
  const claimants = new Map<string, Set<string>>();
  for (const [name, conflict] of conflicts) {
    if (conflict.kind !== "claims") continue;
    for (const lost of conflict.claims) {
      if (lost.kind !== "contested") continue;
      const names = claimants.get(lost.claim) ?? new Set([name]);
      for (const rival of lost.rivals) names.add(rival);
      claimants.set(lost.claim, names);
    }
  }
  return Array.from(
    claimants,
    ([claim, names]) =>
      `Subgraphs ${quotedList([...names])} all define ${claim}${isRootFieldClaim(claim) ? "" : " differently"}, and only the one that registers first keeps it in the supergraph. Rename it in all but one of them.`,
  );
}

/** A warning per subgraph the server would refuse or leave out. */
export function lintSubgraphTypes(projectDir: string): string[] {
  const models = directories(join(projectDir, "document-models"))
    .map(loadDocumentModelInDir)
    .filter((model) => model !== undefined);
  const subgraphsDir = join(projectDir, "subgraphs");
  const subgraphs: PackageSubgraph[] = [];
  const dirs = directories(subgraphsDir)
    .map((entry) => entry.name)
    .sort();
  for (const dir of dirs) {
    const typeDefs = readSchema(join(subgraphsDir, dir, "schema.ts"));
    if (!typeDefs) continue;
    const index = read(join(subgraphsDir, dir, "index.ts")) ?? "";
    subgraphs.push({ name: SUBGRAPH_NAME.exec(index)?.[1] ?? dir, typeDefs });
  }
  if (subgraphs.length === 0) return [];

  const { conflicts, skippedModels } = findPackageSubgraphConflicts(
    subgraphs,
    models,
  );
  return [
    ...skippedModels.map(
      (name) =>
        `Document model "${name}" was left out of the subgraph check: its schema does not generate.`,
    ),
    ...Array.from(conflicts).flatMap(([name, conflict]) =>
      describe(name, conflict),
    ),
    ...describeContests(conflicts),
  ];
}
