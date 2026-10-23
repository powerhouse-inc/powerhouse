import { typedefs as analyticsTypeDefs } from "@powerhousedao/analytics-engine-graphql";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";
import { baseDocumentModels } from "../packages/base-document-models.js";
import {
  DocumentModelSchemaCache,
  type DocumentModelSource,
  findSubgraphTypeCollisions,
  generatedTypesOf,
  getDocumentModelSubgraphName,
  getGeneratedDocumentModelTypes,
  reservedTypeNames,
} from "../utils/create-schema.js";
import authSchema from "./auth/schema.graphql";
import { inspectionAdminTypeDefs } from "./inspection/admin-schema.js";
import { inspectionTypeDefs } from "./inspection/schema.js";
import reactorSchema from "./reactor/schema.graphql";
import {
  type Admission,
  admitDocumentModels,
  CORE_ORIGIN,
  decideAdmission,
  describeOrigin,
  DOCUMENT_MODEL_ORIGIN,
  documentModelSubgraphSources,
  RegistrationOrder,
  type SubgraphOrigin,
  supergraphClaimLosers,
} from "./subgraph-admission.js";
import {
  collectSubgraphClaims,
  type SubgraphClaims,
} from "./subgraph-type-ownership.js";
import { systemTypeDefs } from "./system/schema.js";
import { DOCUMENT_MODEL_SCHEMA_OWNER } from "./subgraph-schema-owner.js";
import type {
  PackageSubgraph,
  PackageSubgraphConflicts,
  PackageSubgraphReport,
  RefusedDocumentModel,
} from "./subgraph-types.js";

/** The type definitions of every core subgraph, by subgraph name. */
export const coreSubgraphTypeDefs: ReadonlyMap<string, DocumentNode> = new Map([
  ["analytics", gql(analyticsTypeDefs)],
  ["system", systemTypeDefs],
  ["r", gql(reactorSchema)],
  ["inspection", inspectionTypeDefs],
  ["inspection-admin", inspectionAdminTypeDefs],
  ["auth", gql(authSchema)],
]);

const PACKAGE_ORIGIN: SubgraphOrigin = "package";

type Registered = {
  name: string;
  origin: SubgraphOrigin;
  typeDefs: DocumentNode;
  ownTypeNames?: ReadonlySet<string>;
};

type Rejection = Extract<Admission<Registered>, { action: "reject" }>;

function claimsOf(typeDefs: DocumentNode, generated: ReadonlySet<string>) {
  try {
    return collectSubgraphClaims(typeDefs, generated);
  } catch {
    // Malformed typeDefs fail where the schema is built, so claim nothing.
    return new Map() as SubgraphClaims;
  }
}

function describeModelSubgraphRejection(rejection: Rejection): string {
  switch (rejection.reason) {
    case "core name":
      return `its subgraph name is taken by a subgraph from ${describeOrigin(CORE_ORIGIN)}`;
    case "rank":
      return `its subgraph name is taken by a subgraph from ${describeOrigin(rejection.holderOrigin)}`;
    case "collision":
      return `its subgraph defines generated types: ${rejection.collisions.join(", ")}`;
  }
}

function packageConflict(
  rejection: Rejection,
  owners: ReadonlyMap<string, string>,
): PackageSubgraphConflicts {
  switch (rejection.reason) {
    case "core name":
      return { nameHeldBy: "core", claims: [] };
    case "rank":
      return { nameHeldBy: "document model", claims: [] };
    case "collision":
      return {
        claims: rejection.collisions.map((claim) => ({
          claim,
          owner: owners.get(claim) ?? DOCUMENT_MODEL_SCHEMA_OWNER,
        })),
      };
  }
}

/** Server admission replayed for one package; hosts and other packages unknown. */
export function checkPackageSubgraphs(
  subgraphs: readonly PackageSubgraph[],
  documentModels: readonly DocumentModelGlobalState[],
): PackageSubgraphReport {
  const packageModels: DocumentModelSource[] = documentModels.map((global) => ({
    documentModel: { global },
  }));
  const { admitted, schemas, refusals } = admitDocumentModels(
    new DocumentModelSchemaCache<DocumentModelSource>().resolve([
      ...baseDocumentModels.map(([, model]) => model),
      ...packageModels,
    ]),
    reservedTypeNames(coreSubgraphTypeDefs.values()),
  );
  const generated = getGeneratedDocumentModelTypes(admitted, schemas);
  const fixed = generatedTypesOf([]).names;
  const generatedOwners = new Map<string, string>();
  for (const model of admitted) {
    const owner = getDocumentModelSubgraphName(model.documentModel.global);
    const { names } = getGeneratedDocumentModelTypes([model], schemas);
    for (const name of names) {
      if (!fixed.has(name)) generatedOwners.set(name, owner);
    }
  }

  const holders = new Map<string, Registered>();
  const order = new RegistrationOrder();
  const register = (entry: Registered): Admission<Registered> => {
    const holder = holders.get(entry.name);
    const admission = decideAdmission(
      entry,
      entry.origin,
      holder ? [{ holder, origin: holder.origin }] : [],
      () => {
        try {
          return findSubgraphTypeCollisions(
            generated,
            entry.typeDefs,
            entry.ownTypeNames,
          );
        } catch {
          return [];
        }
      },
    );
    if (admission.action === "add") {
      holders.set(entry.name, entry);
      order.record(entry.origin, entry.name);
    }
    return admission;
  };

  for (const [name, typeDefs] of coreSubgraphTypeDefs) {
    register({ name, origin: CORE_ORIGIN, typeDefs });
  }

  const refusedModels: RefusedDocumentModel[] = refusals
    .filter(({ model }) => packageModels.includes(model))
    .map(({ model, reason, subgraphOnly }) => ({
      name: model.documentModel.global.name,
      reason,
      subgraphOnly,
    }));
  for (const { model, types } of documentModelSubgraphSources(
    admitted,
    schemas,
  )) {
    const admission = register({
      name: getDocumentModelSubgraphName(model.documentModel.global),
      origin: DOCUMENT_MODEL_ORIGIN,
      typeDefs: types.typeDefs,
      ownTypeNames: types.typeNames,
    });
    if (admission.action === "reject" && packageModels.includes(model)) {
      refusedModels.push({
        name: model.documentModel.global.name,
        reason: describeModelSubgraphRejection(admission),
        subgraphOnly: true,
      });
    }
  }

  const conflicts = new Map<string, PackageSubgraphConflicts>();
  for (const { name, typeDefs } of subgraphs) {
    const admission = register({ name, origin: PACKAGE_ORIGIN, typeDefs });
    if (admission.action === "reject") {
      conflicts.set(name, packageConflict(admission, generatedOwners));
    } else if (admission.action === "add" && admission.replaces.length > 0) {
      conflicts.set(name, { nameHeldBy: "package", claims: [] });
    }
  }

  const excluded = supergraphClaimLosers(
    Array.from(holders.values(), (entry) => ({
      member: entry,
      name: entry.name,
      origin: entry.origin,
      claims: claimsOf(entry.typeDefs, generated.names),
    })),
    order,
  );
  for (const [entry, claims] of excluded) {
    if (entry.origin !== PACKAGE_ORIGIN) continue;
    conflicts.set(entry.name, { ...conflicts.get(entry.name), claims });
  }
  return { conflicts, refusedModels };
}
