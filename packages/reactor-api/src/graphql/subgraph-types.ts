import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { DocumentNode } from "graphql";
import type { OwnershipConflict } from "./subgraph-type-ownership.js";

export type { ReservedTypeNames } from "../utils/create-schema.js";
export type { OwnershipConflict } from "./subgraph-type-ownership.js";

/** Owner of the types every generated document-model schema carries. */
export const DOCUMENT_MODEL_SCHEMA_OWNER = "document-model schema";

/** A package's own subgraph, in the order the package exports it. */
export type PackageSubgraph = { name: string; typeDefs: DocumentNode };

export type PackageSubgraphConflicts = {
  /** Who takes the name; "package" is a later same-name subgraph. */
  nameHeldBy?: "core" | "document model" | "package";
  /** Types and root fields the subgraph loses. */
  claims: OwnershipConflict[];
};

export type RefusedDocumentModel = {
  name: string;
  reason: string;
  /** Only the model's own subgraph is refused; its types are served. */
  subgraphOnly: boolean;
};

export type PackageSubgraphReport = {
  /** By subgraph name; subgraphs without a conflict are left out. */
  conflicts: Map<string, PackageSubgraphConflicts>;
  /** The package's models, or their subgraphs, the server refuses. */
  refusedModels: RefusedDocumentModel[];
};

/** Loaded on call: the check pulls in the base models and core schemas. */
export async function findPackageSubgraphConflicts(
  subgraphs: readonly PackageSubgraph[],
  documentModels: readonly DocumentModelGlobalState[],
): Promise<PackageSubgraphReport> {
  const { checkPackageSubgraphs } = await import("./package-subgraph-check.js");
  return checkPackageSubgraphs(subgraphs, documentModels);
}
