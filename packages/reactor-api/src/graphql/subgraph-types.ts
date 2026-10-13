import { typedefs as analyticsTypeDefs } from "@powerhousedao/analytics-engine-graphql";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { kebabCase } from "change-case";
import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";
import {
  findSubgraphTypeCollisions,
  generateDocumentModelSchema,
  generatedTypesOf,
} from "../utils/create-schema.js";
import authSchema from "./auth/schema.graphql";
import { inspectionTypeDefs } from "./inspection/schema.js";
import reactorSchema from "./reactor/schema.graphql";
import {
  collectSubgraphClaims,
  type OwnershipConflict,
  resolveClaimOwnership,
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

/** Claims `typeDefs` loses to core or to the types `documentModels` generate. */
export function findSubgraphTypeConflicts(
  typeDefs: DocumentNode,
  documentModels: readonly DocumentModelGlobalState[],
): OwnershipConflict[] {
  const generated = generatedTypesOf(documentModels);
  const fixed = generatedTypesOf([]).names;
  const modelOwners = new Map<string, string>();
  for (const model of documentModels) {
    for (const name of generatedTypesOf([model]).names) {
      if (!fixed.has(name)) modelOwners.set(name, kebabCase(model.name));
    }
  }
  const conflicts = findSubgraphTypeCollisions(generated, typeDefs).map(
    (claim) => ({
      claim,
      owner: modelOwners.get(claim) ?? DOCUMENT_MODEL_SCHEMA_OWNER,
    }),
  );

  const self = Symbol("subgraph");
  const owners = [
    ...coreSubgraphTypeDefs,
    ...documentModels.map(
      (model) =>
        [
          kebabCase(model.name),
          generateDocumentModelSchema(model, { useNewApi: true }),
        ] as const,
    ),
  ];
  const excluded = resolveClaimOwnership<string | symbol>(
    [...owners, [self, typeDefs] as const].map(([name, defs]) => ({
      candidate: name,
      name: typeof name === "string" ? name : "",
      claims: collectSubgraphClaims(defs, generated.names),
    })),
  );
  return [...conflicts, ...(excluded.get(self) ?? [])];
}
