import { typedefs as analyticsTypeDefs } from "@powerhousedao/analytics-engine-graphql";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { type DocumentNode, Kind } from "graphql";
import { gql } from "graphql-tag";
import { baseDocumentModels } from "../packages/base-document-models.js";
import {
  admitDocumentModel,
  buildDocumentModelSchema,
  type DocumentModelSchema,
  type DocumentModelSource,
  findSubgraphTypeCollisions,
  type GeneratedDocumentModelTypes,
  generatedTypesOf,
  getDocumentModelSubgraphName,
  globalStateOf,
  reservedTypeNames,
  typeDefinitionNames,
} from "../utils/create-schema.js";
import authSchema from "./auth/schema.graphql";
import { inspectionTypeDefs } from "./inspection/schema.js";
import reactorSchema from "./reactor/schema.graphql";
import {
  claimsConflict,
  collectSubgraphClaims,
  isRootFieldClaim,
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

/** `"a"`, `"a" and "b"`, or `"a", "b" and "c"`. */
export function quotedNames(names: readonly string[]): string {
  const quoted = names.map((name) => `"${name}"`);
  return quoted.length < 2
    ? quoted.join("")
    : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
}

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

/** A package's own subgraph, as the server would receive it. */
export type PackageSubgraph = { name: string; typeDefs: DocumentNode };

/** A model the server refuses whole, or whose own subgraph it refuses. */
export type RefusedDocumentModel = {
  readonly id: string;
  readonly name: string;
  readonly kind: "unusable schema" | "reserved names" | "unusable subgraph";
  /** The reason the server logs. */
  readonly reason: string;
};

/** The document models as the server admits them, built once per check. */
export type HostDocumentModels<M extends DocumentModelSource> = {
  /** The base models, then the given models the server admits. */
  readonly admitted: readonly (M | DocumentModelModule)[];
  /** The given models the server refuses, whole or their subgraph only. */
  readonly refused: readonly RefusedDocumentModel[];
  /** The generated schema every subgraph is built onto. */
  readonly generated: GeneratedDocumentModelTypes;
  /** Generated type name to the model subgraph whose model generates it. */
  readonly generatedOwners: ReadonlyMap<string, string>;
  /** The model subgraphs the server registers. Each holds its name and claims. */
  readonly subgraphs: readonly PackageSubgraph[];
};

/** Admits the base models and `documentModels` as the server does. */
export function hostDocumentModels<M extends DocumentModelSource>(
  documentModels: readonly M[],
): HostDocumentModels<M> {
  const reserved = reservedTypeNames(coreSubgraphTypeDefs.values());
  const given = new Set<DocumentModelSource>(documentModels);
  const admitted: (M | DocumentModelModule)[] = [];
  const refused: RefusedDocumentModel[] = [];
  const schemas = new Map<DocumentModelSource, DocumentModelSchema>();
  const subgraphs: PackageSubgraph[] = [];
  const refuse = (
    model: DocumentModelSource,
    kind: RefusedDocumentModel["kind"],
    reason: string,
  ) => {
    if (!given.has(model)) return;
    const { id, name } = globalStateOf(model);
    refused.push({ id, name, kind, reason });
  };

  for (const model of [
    ...baseDocumentModels.map(([, base]) => base),
    ...documentModels,
  ]) {
    let built: DocumentModelSchema | Error;
    try {
      built = buildDocumentModelSchema(model);
    } catch (error) {
      built = error instanceof Error ? error : new Error(String(error));
    }
    const admission = admitDocumentModel(
      built instanceof Error
        ? { model, error: built }
        : { model, schema: built },
      reserved,
    );
    if (!admission.admitted) {
      refuse(model, admission.refusal, admission.reason);
      continue;
    }
    admitted.push(model);
    schemas.set(model, admission.schema);
    if (admission.subgraphRefusal !== undefined) {
      refuse(model, "unusable subgraph", admission.subgraphRefusal);
      continue;
    }
    const own = admission.schema.subgraph;
    const name = getDocumentModelSubgraphName(globalStateOf(model));
    // Every version of a model projects the same subgraph, registered once.
    if (own && !subgraphs.some((subgraph) => subgraph.name === name)) {
      subgraphs.push({ name, typeDefs: own.typeDefs });
    }
  }

  const fixed = generatedTypesOf([]).names;
  const generatedOwners = new Map<string, string>();
  for (const model of admitted) {
    const definitions = schemas.get(model)?.generated ?? [];
    for (const name of typeDefinitionNames({
      kind: Kind.DOCUMENT,
      definitions,
    })) {
      if (!fixed.has(name)) {
        generatedOwners.set(
          name,
          getDocumentModelSubgraphName(globalStateOf(model)),
        );
      }
    }
  }

  return {
    admitted,
    refused,
    generated: generatedTypesOf(admitted, schemas),
    generatedOwners,
    subgraphs,
  };
}

/**
 * Why the server refuses a package subgraph, or leaves it out of the
 * supergraph because a core or model subgraph owns one of its claims.
 */
export type PackageSubgraphConflicts =
  | { kind: "name"; heldBy: "core" | "document model" }
  | { kind: "generated"; claims: OwnershipConflict[] }
  | { kind: "owned"; claims: OwnershipConflict[] };

/**
 * A claim package subgraphs make that the supergraph can keep for one
 * definition only. Which one depends on the order the subgraphs register, so
 * no claimant is named the winner: a subgraph that loses any claim is left out
 * whole, and with it the claims it would have won.
 */
export type ClaimContest = {
  claim: string;
  /** In name order. */
  claimants: PackageSubgraph[];
  /** Claimant names grouped by definition, each group in name order. */
  groups: string[][];
};

export type PackageSubgraphReport = {
  /** By subgraph; subgraphs without a conflict are left out. */
  conflicts: Map<PackageSubgraph, PackageSubgraphConflicts>;
  /** In claim order. */
  contests: ClaimContest[];
  /**
   * Names more than one package subgraph uses. The server serves only the
   * last of them to register, so each is checked on its own claims.
   */
  duplicateNames: string[];
};

function claimsOf(typeDefs: DocumentNode, generated: ReadonlySet<string>) {
  try {
    return collectSubgraphClaims(typeDefs, generated);
  } catch {
    // Malformed typeDefs fail where the schema is built, so claim nothing.
    return new Map() as SubgraphClaims;
  }
}

/** Why the server refuses `subgraph` before building it, if it does. */
export function refusePackageSubgraph(
  subgraph: PackageSubgraph,
  host: HostDocumentModels<DocumentModelSource>,
): PackageSubgraphConflicts | undefined {
  if (coreSubgraphTypeDefs.has(subgraph.name)) {
    return { kind: "name", heldBy: "core" };
  }
  if (host.subgraphs.some((owner) => owner.name === subgraph.name)) {
    return { kind: "name", heldBy: "document model" };
  }
  let collisions: string[];
  try {
    collisions = findSubgraphTypeCollisions(host.generated, subgraph.typeDefs);
  } catch {
    collisions = [];
  }
  return collisions.length > 0
    ? generatedTypeConflict(collisions, host)
    : undefined;
}

/** The refusal for a subgraph that redefines the generated `typeNames`. */
export function generatedTypeConflict(
  typeNames: readonly string[],
  host: HostDocumentModels<DocumentModelSource>,
): PackageSubgraphConflicts {
  return {
    kind: "generated",
    claims: typeNames.map((claim) => ({
      claim,
      owner: host.generatedOwners.get(claim) ?? DOCUMENT_MODEL_SCHEMA_OWNER,
    })),
  };
}

const byCodeUnits = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/** Package subgraphs the server refuses or excludes; host subgraphs unchecked. */
export function findPackageSubgraphConflicts(
  subgraphs: readonly PackageSubgraph[],
  host: HostDocumentModels<DocumentModelSource>,
): PackageSubgraphReport {
  const conflicts = new Map<PackageSubgraph, PackageSubgraphConflicts>();
  const hostCandidates = [
    ...Array.from(coreSubgraphTypeDefs, ([name, typeDefs]) => ({
      name,
      typeDefs,
    })),
    ...host.subgraphs,
  ].map(({ name, typeDefs }) => ({
    candidate: name as string | PackageSubgraph,
    name,
    claims: claimsOf(typeDefs, host.generated.names),
  }));
  const claimants = new Map<
    string,
    { subgraph: PackageSubgraph; definition: string }[]
  >();
  for (const subgraph of subgraphs) {
    const refusal = refusePackageSubgraph(subgraph, host);
    if (refusal !== undefined) {
      conflicts.set(subgraph, refusal);
      continue;
    }
    const claims = claimsOf(subgraph.typeDefs, host.generated.names);
    const owned = resolveClaimOwnership([
      ...hostCandidates,
      { candidate: subgraph, name: subgraph.name, claims },
    ]).get(subgraph);
    if (owned) {
      conflicts.set(subgraph, { kind: "owned", claims: owned });
      continue;
    }
    for (const [claim, definition] of claims) {
      claimants.set(claim, [
        ...(claimants.get(claim) ?? []),
        { subgraph, definition },
      ]);
    }
  }

  const contests: ClaimContest[] = [];
  for (const [claim, holders] of Array.from(claimants).sort(([left], [right]) =>
    byCodeUnits(left, right),
  )) {
    // A same-name subgraph is the same slot on the server, not a rival.
    const contested = holders
      .filter((holder) =>
        holders.some(
          (other) =>
            other.subgraph.name !== holder.subgraph.name &&
            claimsConflict(claim, holder.definition, other.definition),
        ),
      )
      .sort((left, right) =>
        byCodeUnits(left.subgraph.name, right.subgraph.name),
      );
    if (contested.length === 0) continue;
    const groups = new Map<string, Set<string>>();
    for (const { subgraph, definition } of contested) {
      groups.set(
        definition,
        (groups.get(definition) ?? new Set()).add(subgraph.name),
      );
    }
    contests.push({
      claim,
      claimants: contested.map(({ subgraph }) => subgraph),
      groups: Array.from(groups.values(), (names) => [...names]).sort(
        ([left], [right]) => byCodeUnits(left, right),
      ),
    });
  }

  const seen = new Set<string>();
  const duplicateNames = new Set<string>();
  for (const { name } of subgraphs) {
    if (seen.has(name)) duplicateNames.add(name);
    seen.add(name);
  }
  return { conflicts, contests, duplicateNames: [...duplicateNames] };
}

/**
 * A warning, worded once for the code-first check and the schema-first lint,
 * so both styles tell an author the same thing.
 */
export type SubgraphWarning = {
  readonly code:
    | "PH-DM-GRAPHQL-REFUSED"
    | "PH-SG-NAME-TAKEN"
    | "PH-SG-GENERATED-TYPE-TAKEN"
    | "PH-GQL-COORDINATE-OWNED"
    | "PH-GQL-SHARED-DEFINITION-MISMATCH";
  /** The claim the warning is about, when it is about one. */
  readonly claim?: string;
  readonly message: string;
  readonly repair: string;
};

const sentence = (text: string) => (text.endsWith(".") ? text : `${text}.`);

export function describeRefusedDocumentModel(
  model: RefusedDocumentModel,
): SubgraphWarning {
  const { name, kind, reason } = model;
  return {
    code: "PH-DM-GRAPHQL-REFUSED",
    message: sentence(
      kind === "unusable subgraph"
        ? `The server refuses the subgraph of document model "${name}": it ${reason}`
        : `The server refuses document model "${name}": it ${reason}`,
    ),
    repair:
      kind === "unusable schema"
        ? "Fix the document model's state and operation schemas so they build."
        : kind === "reserved names"
          ? "Rename the document model, or the types it generates that the server reserves."
          : "Fix the operation schemas so the model's subgraph builds.",
  };
}

export function describeSubgraphConflict(
  name: string,
  conflict: PackageSubgraphConflicts,
): SubgraphWarning[] {
  switch (conflict.kind) {
    case "name":
      return [
        {
          code: "PH-SG-NAME-TAKEN",
          message: `Subgraph "${name}" has the name of a ${conflict.heldBy} subgraph, so the server refuses it.`,
          repair: "Rename the subgraph.",
        },
      ];
    case "generated":
      return [
        {
          code: "PH-SG-GENERATED-TYPE-TAKEN",
          message: `Subgraph "${name}" defines ${conflict.claims.map(({ claim }) => claim).join(", ")}, which the document-model schema generates, so the server refuses it.`,
          repair: "Rename those types in this subgraph.",
        },
      ];
    case "owned":
      return conflict.claims.map(({ claim, owner }) =>
        isRootFieldClaim(claim)
          ? {
              code: "PH-GQL-COORDINATE-OWNED",
              claim,
              message: `Subgraph "${name}" defines ${claim}, which "${owner}" owns, so the server leaves it out of the supergraph.`,
              repair: `Rename ${claim} in this subgraph.`,
            }
          : {
              code: "PH-GQL-SHARED-DEFINITION-MISMATCH",
              claim,
              message: `Subgraph "${name}" defines ${claim} differently from "${owner}", which owns it, so the server leaves it out of the supergraph.`,
              repair: `Rename ${claim} in this subgraph, or define it exactly as "${owner}" does.`,
            },
      );
  }
}

export function describeClaimContest(contest: ClaimContest): SubgraphWarning {
  const { claim, claimants, groups } = contest;
  if (isRootFieldClaim(claim)) {
    const names = [...new Set(claimants.map(({ name }) => name))];
    return {
      code: "PH-GQL-COORDINATE-OWNED",
      claim,
      message: `Subgraphs ${quotedNames(names)} ${names.length === 2 ? "both" : "all"} define ${claim}, and the supergraph can include only one of them.`,
      repair: `Define ${claim} in one subgraph only.`,
    };
  }
  const ways = groups.map(
    (group, index) =>
      `${index === 0 ? "one way" : "another way"} by ${quotedNames(group)}`,
  );
  return {
    code: "PH-GQL-SHARED-DEFINITION-MISMATCH",
    claim,
    message: `${claim} is defined ${ways.slice(0, -1).join(", ")}, and ${ways.at(-1)}. The supergraph can include the subgraphs of only one of these definitions.`,
    repair: `Make every definition of ${claim} identical, or rename it where it differs.`,
  };
}
