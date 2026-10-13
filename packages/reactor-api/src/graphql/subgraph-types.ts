import { typedefs as analyticsTypeDefs } from "@powerhousedao/analytics-engine-graphql";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";
import { baseDocumentModels } from "../packages/base-document-models.js";
import {
  findSubgraphTypeCollisions,
  documentModelSubgraphTypes,
  generatedTypesOf,
  getDocumentModelSubgraphName,
  hasOperationSchemas,
} from "../utils/create-schema.js";
import authSchema from "./auth/schema.graphql";
import { inspectionTypeDefs } from "./inspection/schema.js";
import reactorSchema from "./reactor/schema.graphql";
import {
  collectSubgraphClaims,
  type OwnershipConflict,
  resolveClaimOwnership,
  type SubgraphClaims,
} from "./subgraph-type-ownership.js";
import { systemTypeDefs } from "./system/schema.js";

export {
  reservedTypeNames,
  type ReservedTypeNames,
} from "../utils/create-schema.js";
export type { OwnershipConflict } from "./subgraph-type-ownership.js";

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

export type PackageSubgraphConflicts = {
  /** Set when the server refuses the subgraph's name. */
  nameHeldBy?: "core" | "document model";
  /** Types and root fields the subgraph loses. */
  claims: OwnershipConflict[];
};

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

/** Package subgraphs the server refuses or excludes; host subgraphs unchecked. */
export function findPackageSubgraphConflicts(
  subgraphs: readonly PackageSubgraph[],
  documentModels: readonly DocumentModelGlobalState[],
): PackageSubgraphReport {
  const models: DocumentModelGlobalState[] = [];
  const modelSubgraphs: ModelSubgraph[] = [];
  const skippedModels: string[] = [];
  const allModels = [
    ...baseDocumentModels.map(([, model]) => model.documentModel.global),
    ...documentModels,
  ];
  for (const model of allModels) {
    let typeDefs: DocumentNode | undefined;
    try {
      generatedTypesOf([model]);
      if (hasOperationSchemas(model)) {
        typeDefs = documentModelSubgraphTypes(model).typeDefs;
      }
    } catch {
      skippedModels.push(model.name);
      continue;
    }
    models.push(model);
    const name = getDocumentModelSubgraphName(model);
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
        generatedOwners.set(name, getDocumentModelSubgraphName(model));
      }
    }
  }

  const conflicts = new Map<string, PackageSubgraphConflicts>();
  const admitted: PackageSubgraph[] = [];
  for (const subgraph of subgraphs) {
    if (coreSubgraphTypeDefs.has(subgraph.name)) {
      conflicts.set(subgraph.name, { nameHeldBy: "core", claims: [] });
      continue;
    }
    if (modelSubgraphs.some((owner) => owner.name === subgraph.name)) {
      conflicts.set(subgraph.name, {
        nameHeldBy: "document model",
        claims: [],
      });
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
        claims: collisions.map((claim) => ({
          claim,
          owner: generatedOwners.get(claim) ?? DOCUMENT_MODEL_SCHEMA_OWNER,
        })),
      });
      continue;
    }
    admitted.push(subgraph);
  }

  const packageNames = new Set(admitted.map(({ name }) => name));
  const excluded = resolveClaimOwnership(
    [
      ...Array.from(coreSubgraphTypeDefs, ([name, typeDefs]) => ({
        name,
        typeDefs,
      })),
      ...modelSubgraphs,
      ...admitted,
    ].map(({ name, typeDefs }) => ({
      candidate: name,
      name,
      claims: claimsOf(typeDefs, generated.names),
    })),
  );
  for (const [name, claims] of excluded) {
    if (packageNames.has(name)) conflicts.set(name, { claims });
  }
  return { conflicts, skippedModels };
}
