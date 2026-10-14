import { typedefs as analyticsTypeDefs } from "@powerhousedao/analytics-engine-graphql";
import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";
import { baseDocumentModels } from "../packages/base-document-models.js";
import {
  type DocumentModelSource,
  findSubgraphTypeCollisions,
  documentModelSubgraphTypes,
  generatedTypesOf,
  getDocumentModelSubgraphName,
  globalStateOf,
  hasOperationSchemas,
} from "../utils/create-schema.js";
import authSchema from "./auth/schema.graphql";
import { inspectionTypeDefs } from "./inspection/schema.js";
import reactorSchema from "./reactor/schema.graphql";
import {
  collectSubgraphClaims,
  type OwnershipConflict,
  isRootFieldClaim,
  resolveClaimOwnership,
  type SubgraphClaims,
} from "./subgraph-type-ownership.js";
import { systemTypeDefs } from "./system/schema.js";

export {
  reservedTypeNames,
  type ReservedTypeNames,
} from "../utils/create-schema.js";
export {
  isRootFieldClaim,
  type OwnershipConflict,
} from "./subgraph-type-ownership.js";

/** Owner of the types every generated document-model schema carries. */
export const DOCUMENT_MODEL_SCHEMA_OWNER = "document-model schema";

/** The type definitions of every core subgraph, by subgraph name. */
export const coreSubgraphTypeDefs: ReadonlyMap<string, DocumentNode> = new Map([
  ["analytics", gql(analyticsTypeDefs)],
  ["system", systemTypeDefs],
  ["r", gql(reactorSchema)],
  ["inspection", inspectionTypeDefs],
  ["auth", gql(authSchema)],
]);

/** A package's own subgraph, in the order the package exports it. */
export type PackageSubgraph = { name: string; typeDefs: DocumentNode };

/**
 * A type or root field the subgraph cannot keep. A core or model subgraph
 * that owns it outranks every package subgraph. Between package subgraphs,
 * only the one that registers first keeps a contested claim, and the checks
 * cannot know that order.
 */
export type PackageClaimConflict =
  | { kind: "owned"; claim: string; owner: string }
  | { kind: "contested"; claim: string; rivals: string[] };

/**
 * Why the server would not serve a package subgraph whole. It refuses one
 * whose name is taken or that redefines a generated type, and leaves one that
 * loses a claim out of the supergraph while still serving its own route.
 */
export type PackageSubgraphConflicts =
  | { kind: "name"; heldBy: "core" | "document model" }
  | { kind: "generated"; claims: OwnershipConflict[] }
  | { kind: "claims"; claims: PackageClaimConflict[] };

export type PackageSubgraphReport = {
  /** By subgraph name; subgraphs without a conflict are left out. */
  conflicts: Map<string, PackageSubgraphConflicts>;
  /** Models whose schema does not generate, left out of the check. */
  skippedModels: string[];
};

type ModelSubgraph = { name: string; typeDefs: DocumentNode };

function claimsOf(typeDefs: DocumentNode, generated: ReadonlySet<string>) {
  try {
    return collectSubgraphClaims(typeDefs, generated);
  } catch {
    // Malformed typeDefs fail where the schema is built, so claim nothing.
    return new Map() as SubgraphClaims;
  }
}

/**
 * Package subgraphs the server refuses or excludes; host subgraphs unchecked.
 * Pass a code-first model as its module, so its types are the ones it serves.
 */
export function findPackageSubgraphConflicts(
  subgraphs: readonly PackageSubgraph[],
  documentModels: readonly DocumentModelSource[],
): PackageSubgraphReport {
  const models: DocumentModelSource[] = [];
  const modelSubgraphs: ModelSubgraph[] = [];
  const skippedModels: string[] = [];
  const allModels = [
    ...baseDocumentModels.map(([, model]) => model),
    ...documentModels,
  ];
  for (const model of allModels) {
    let typeDefs: DocumentNode | undefined;
    try {
      generatedTypesOf([model]);
      if (hasOperationSchemas(globalStateOf(model))) {
        typeDefs = documentModelSubgraphTypes(model).typeDefs;
      }
    } catch {
      skippedModels.push(globalStateOf(model).name);
      continue;
    }
    models.push(model);
    const name = getDocumentModelSubgraphName(globalStateOf(model));
    if (typeDefs && !modelSubgraphs.some((owner) => owner.name === name)) {
      modelSubgraphs.push({ name, typeDefs });
    }
  }

  const generated = generatedTypesOf(models);
  const fixed = generatedTypesOf([]).names;
  const generatedOwners = new Map<string, string>();
  for (const model of models) {
    for (const name of generatedTypesOf([model]).names) {
      if (!fixed.has(name)) {
        generatedOwners.set(
          name,
          getDocumentModelSubgraphName(globalStateOf(model)),
        );
      }
    }
  }

  const conflicts = new Map<string, PackageSubgraphConflicts>();
  const admitted: PackageSubgraph[] = [];
  for (const subgraph of subgraphs) {
    if (coreSubgraphTypeDefs.has(subgraph.name)) {
      conflicts.set(subgraph.name, { kind: "name", heldBy: "core" });
      continue;
    }
    if (modelSubgraphs.some((owner) => owner.name === subgraph.name)) {
      conflicts.set(subgraph.name, { kind: "name", heldBy: "document model" });
      continue;
    }
    let collisions: string[];
    try {
      collisions = findSubgraphTypeCollisions(generated, subgraph.typeDefs);
    } catch {
      collisions = [];
    }
    if (collisions.length > 0) {
      conflicts.set(subgraph.name, {
        kind: "generated",
        claims: collisions.map((claim) => ({
          claim,
          owner: generatedOwners.get(claim) ?? DOCUMENT_MODEL_SCHEMA_OWNER,
        })),
      });
      continue;
    }
    admitted.push(subgraph);
  }

  // The server replaces a package subgraph with a later one of the same name.
  const slots = new Map<string, PackageSubgraph>();
  for (const subgraph of admitted) slots.set(subgraph.name, subgraph);

  const hostCandidates = [
    ...Array.from(coreSubgraphTypeDefs, ([name, typeDefs]) => ({
      name,
      typeDefs,
    })),
    ...modelSubgraphs,
  ].map(({ name, typeDefs }) => ({
    candidate: name,
    name,
    claims: claimsOf(typeDefs, generated.names),
  }));
  const claimants = new Map<string, { name: string; definition: string }[]>();
  for (const { name, typeDefs } of slots.values()) {
    const claims = claimsOf(typeDefs, generated.names);
    const owned = resolveClaimOwnership([
      ...hostCandidates,
      { candidate: name, name, claims },
    ]).get(name);
    if (owned) {
      conflicts.set(name, {
        kind: "claims",
        claims: owned.map(({ claim, owner }) => ({
          kind: "owned",
          claim,
          owner,
        })),
      });
      continue;
    }
    for (const [claim, definition] of claims) {
      claimants.set(claim, [
        ...(claimants.get(claim) ?? []),
        { name, definition },
      ]);
    }
  }

  const contested = new Map<string, PackageClaimConflict[]>();
  const byClaim = Array.from(claimants).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  for (const [claim, holders] of byClaim) {
    for (const holder of holders) {
      const rivals = holders
        .filter(
          (other) =>
            other.name !== holder.name &&
            (isRootFieldClaim(claim) || other.definition !== holder.definition),
        )
        .map((other) => other.name);
      if (rivals.length === 0) continue;
      contested.set(holder.name, [
        ...(contested.get(holder.name) ?? []),
        { kind: "contested", claim, rivals },
      ]);
    }
  }
  for (const [name, claims] of contested) {
    conflicts.set(name, { kind: "claims", claims });
  }
  return { conflicts, skippedModels };
}
