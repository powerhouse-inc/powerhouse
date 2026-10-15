import { typedefs as analyticsTypeDefs } from "@powerhousedao/analytics-engine-graphql";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { DefinitionDiagnosticCode } from "document-model";
import { type DocumentNode, Kind } from "graphql";
import { gql } from "graphql-tag";
import { baseDocumentModels } from "../packages/base-document-models.js";
import {
  admitDocumentModel,
  buildDocumentModelSchema,
  createSchema,
  type DocumentModelSchema,
  type DocumentModelSource,
  findSubgraphTypeCollisions,
  type GeneratedDocumentModelTypes,
  generatedTypesOf,
  getDocumentModelSchemaName,
  getDocumentModelSubgraphName,
  globalStateOf,
  isDocumentModelModule,
  latestDocumentModelVersions,
  reservedTypeNames,
  SubgraphTypeCollisionError,
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

/** `a`, `a and b`, or `a, b and c`. */
function listed(items: readonly string[]): string {
  return items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** `"a"`, `"a" and "b"`, or `"a", "b" and "c"`. */
export function quotedNames(names: readonly string[]): string {
  return listed(names.map((name) => `"${name}"`));
}

/** Owner of the types every generated document-model schema carries. */
export const DOCUMENT_MODEL_SCHEMA_OWNER = "document-model schema";

/**
 * The type definitions of every core subgraph, by subgraph name. The server
 * registers `inspection` and `auth` only when inspection and document
 * permissions are on, and the checks assume they are, so a name or claim
 * that avoids them is free on every host.
 */
export const coreSubgraphTypeDefs: ReadonlyMap<string, DocumentNode> = new Map([
  ["analytics", gql(analyticsTypeDefs)],
  ["system", systemTypeDefs],
  ["r", gql(reactorSchema)],
  ["inspection", inspectionTypeDefs],
  ["auth", gql(authSchema)],
]);

/** A package's own subgraph, as the server would receive it. */
export type PackageSubgraph = { name: string; typeDefs: DocumentNode };

/**
 * A model the server refuses whole, or whose own subgraph it refuses or
 * registers without being able to serve it.
 */
export type RefusedDocumentModel = {
  readonly id: string;
  readonly name: string;
  readonly kind:
    | "unusable schema"
    | "reserved names"
    | "unusable subgraph"
    | "reserved subgraph name"
    | "unservable subgraph";
  /** The reason the server logs. */
  readonly reason: string;
  /**
   * For an unservable subgraph, the other model whose generated types it
   * clashes with: the first listed under the same schema name.
   */
  readonly supplier?: DocumentModelIdentity;
};

/** A document model as a refusal names it. */
export type DocumentModelIdentity = {
  readonly id: string;
  readonly name: string;
};

/** A model subgraph the server registers, holding its name. */
export type RegisteredModelSubgraph = PackageSubgraph & {
  /** Whether it builds onto the generated schema, and so holds claims. */
  readonly builds: boolean;
};

/** The document models as the server admits them, built once per check. */
export type HostDocumentModels<M extends DocumentModelSource> = {
  /** The base models, then the given models the server admits. */
  readonly admitted: readonly (M | DocumentModelModule)[];
  /** The given models whose schema or own subgraph the server cannot serve. */
  readonly refused: readonly RefusedDocumentModel[];
  /** The generated schema every subgraph is built onto. */
  readonly generated: GeneratedDocumentModelTypes;
  /**
   * Generated type name to the model that generates it: the first listed
   * under its schema name, as the generated schema keeps that one.
   */
  readonly generatedOwners: ReadonlyMap<string, DocumentModelIdentity>;
  /**
   * The model subgraphs the server registers, each holding its name. Only
   * those that build onto the generated schema hold claims.
   */
  readonly subgraphs: readonly RegisteredModelSubgraph[];
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
  const refuse = (
    model: DocumentModelSource,
    kind: RefusedDocumentModel["kind"],
    reason: string,
    supplier?: DocumentModelIdentity,
  ) => {
    if (!given.has(model)) return;
    const { id, name } = globalStateOf(model);
    // One warning per model and reason, however many versions share it.
    if (
      refused.some(
        (other) =>
          other.id === id && other.kind === kind && other.reason === reason,
      )
    ) {
      return;
    }
    refused.push({
      id,
      name,
      kind,
      reason,
      ...(supplier !== undefined && { supplier }),
    });
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
    }
  }

  // The server registers the latest version's subgraph only, refuses one
  // whose name a core subgraph holds, and lets a later model whose subgraph
  // takes the same name replace an earlier one.
  const latest = new Map<
    string,
    {
      model: M | DocumentModelModule;
      own: NonNullable<DocumentModelSchema["subgraph"]>;
    }
  >();
  for (const model of latestDocumentModelVersions(admitted)) {
    const own = schemas.get(model)?.subgraph;
    if (own === undefined) continue;
    const name = getDocumentModelSubgraphName(globalStateOf(model));
    if (coreSubgraphTypeDefs.has(name)) {
      refuse(
        model,
        "reserved subgraph name",
        `has a subgraph named "${name}", which a core subgraph holds`,
      );
      continue;
    }
    latest.set(name, { model, own });
  }

  const generated = generatedTypesOf(admitted, schemas);
  const fixed = generatedTypesOf([]).names;
  const generatedOwners = new Map<string, DocumentModelIdentity>();
  const supplied = new Set<string>();
  for (const model of admitted) {
    const global = globalStateOf(model);
    const schemaName = getDocumentModelSchemaName(global);
    if (supplied.has(schemaName)) continue;
    supplied.add(schemaName);
    const definitions = schemas.get(model)?.generated ?? [];
    for (const name of typeDefinitionNames({
      kind: Kind.DOCUMENT,
      definitions,
    })) {
      if (!fixed.has(name) && !generatedOwners.has(name)) {
        generatedOwners.set(name, { id: global.id, name: global.name });
      }
    }
  }

  // Each subgraph is set up onto the generated schema of every admitted
  // model, so one that builds alone can still fail beside the others. The
  // server keeps it registered, holding its name, with nothing mounted and
  // no claims.
  const modules = admitted.filter(isDocumentModelModule);
  const subgraphs: RegisteredModelSubgraph[] = [];
  for (const [name, { model, own }] of latest) {
    let builds = true;
    try {
      createSchema(modules, {}, own.typeDefs, {
        generated,
        ownTypeNames: own.typeNames,
        reportScalars: false,
      });
    } catch (error) {
      builds = false;
      // A type the subgraph defines that another model generated is the
      // clash; another version of the same model is not another model.
      // The supplier is the first model to generate that type name.
      const { id } = globalStateOf(model);
      const supplier = [...own.typeNames]
        .map((typeName) => generatedOwners.get(typeName))
        .find((owner) => owner !== undefined && owner.id !== id);
      refuse(
        model,
        "unservable subgraph",
        `does not build onto the generated schema: ${error instanceof Error ? error.message : String(error)}`,
        supplier,
      );
    }
    subgraphs.push({ name, typeDefs: own.typeDefs, builds });
  }

  return {
    admitted,
    refused,
    generated,
    generatedOwners,
    subgraphs,
  };
}

/**
 * Why the server refuses a package subgraph, does not serve it because its
 * schema does not build, or leaves it out of the supergraph because a core or
 * model subgraph owns one of its claims.
 */
export type PackageSubgraphConflicts =
  | { kind: "name"; heldBy: "core" | "document model" }
  | { kind: "generated"; claims: OwnershipConflict[] }
  | { kind: "unbuildable"; message: string }
  | { kind: "owned"; claims: OwnershipConflict[] };

/**
 * A claim package subgraphs make that the supergraph can keep for one
 * definition only. Which one depends on the order the subgraphs register, so
 * no claimant is named the winner: a subgraph that loses any claim is left out
 * whole, and with it the claims it would have won.
 */
export type ClaimContest<S extends PackageSubgraph = PackageSubgraph> = {
  claim: string;
  /** In name order. */
  claimants: S[];
  /** Claimant names grouped by definition, each group in name order. */
  groups: string[][];
};

export type PackageSubgraphReport<S extends PackageSubgraph = PackageSubgraph> =
  {
    /** By subgraph; subgraphs without a conflict are left out. */
    conflicts: Map<S, PackageSubgraphConflicts>;
    /** In claim order. */
    contests: ClaimContest<S>[];
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
function refusePackageSubgraph(
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
function generatedTypeConflict(
  typeNames: readonly string[],
  host: HostDocumentModels<DocumentModelSource>,
): PackageSubgraphConflicts {
  return {
    kind: "generated",
    claims: typeNames.map((claim) => ({
      claim,
      owner:
        host.generatedOwners.get(claim)?.name ?? DOCUMENT_MODEL_SCHEMA_OWNER,
    })),
  };
}

/**
 * Builds `subgraph` as the server does, onto the admitted models' generated
 * schema. Throws when the server could not serve it.
 */
export function buildPackageSubgraph(
  subgraph: PackageSubgraph,
  host: HostDocumentModels<DocumentModelSource>,
  options: {
    resolvers?: Parameters<typeof createSchema>[1];
    /**
     * The host logs each scalar finding once per process, so a check that
     * runs inside the host must not report it first.
     */
    reportScalars: boolean;
  },
): void {
  createSchema(
    host.admitted.filter(isDocumentModelModule),
    options.resolvers ?? {},
    subgraph.typeDefs,
    { generated: host.generated, reportScalars: options.reportScalars },
  );
}

const byCodeUnits = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/**
 * Package subgraphs the server refuses, does not serve, or excludes, decided in
 * the server's order: a taken name or generated type first, then the build,
 * then the claims. `build` throws as the server's build does; host subgraphs
 * are not checked.
 */
export function findPackageSubgraphConflicts<S extends PackageSubgraph>(
  subgraphs: readonly S[],
  host: HostDocumentModels<DocumentModelSource>,
  build: (subgraph: S) => void = (subgraph) =>
    buildPackageSubgraph(subgraph, host, { reportScalars: false }),
): PackageSubgraphReport<S> {
  const conflicts = new Map<S, PackageSubgraphConflicts>();
  const hostCandidates = [
    ...Array.from(coreSubgraphTypeDefs, ([name, typeDefs]) => ({
      name,
      typeDefs,
    })),
    ...host.subgraphs.filter(({ builds }) => builds),
  ].map(({ name, typeDefs }) => ({
    candidate: name as string | S,
    name,
    claims: claimsOf(typeDefs, host.generated.names),
  }));
  const claimants = new Map<string, { subgraph: S; definition: string }[]>();
  for (const subgraph of subgraphs) {
    const refusal = refusePackageSubgraph(subgraph, host);
    if (refusal !== undefined) {
      conflicts.set(subgraph, refusal);
      continue;
    }
    try {
      build(subgraph);
    } catch (error) {
      conflicts.set(
        subgraph,
        error instanceof SubgraphTypeCollisionError
          ? generatedTypeConflict(error.typeNames, host)
          : {
              kind: "unbuildable",
              message: error instanceof Error ? error.message : String(error),
            },
      );
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

  const contests: ClaimContest<S>[] = [];
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
  readonly code: Extract<
    DefinitionDiagnosticCode,
    | "PH-DM-GRAPHQL-REFUSED"
    | "PH-SG-NAME-TAKEN"
    | "PH-SG-GENERATED-TYPE-TAKEN"
    | "PH-SG-SCHEMA-INVALID"
    | "PH-GQL-COORDINATE-OWNED"
    | "PH-GQL-SHARED-DEFINITION-MISMATCH"
  >;
  /** The claim the warning is about, when it is about one. */
  readonly claim?: string;
  readonly message: string;
  readonly repair: string;
};

const sentence = (text: string) => (text.endsWith(".") ? text : `${text}.`);

const REFUSED_MODEL_WORDING: Record<
  RefusedDocumentModel["kind"],
  {
    subject: (name: string) => string;
    repair: (model: RefusedDocumentModel) => string;
  }
> = {
  "unusable schema": {
    subject: (name) => `The server refuses document model "${name}"`,
    repair: () =>
      "Fix the document model's state and operation schemas so they build.",
  },
  "reserved names": {
    subject: (name) => `The server refuses document model "${name}"`,
    repair: () =>
      "Rename the document model, or the types it generates that the server reserves.",
  },
  "unusable subgraph": {
    subject: (name) =>
      `The server refuses the subgraph of document model "${name}"`,
    repair: () => "Fix the operation schemas so the model's subgraph builds.",
  },
  "reserved subgraph name": {
    subject: (name) =>
      `The server refuses the subgraph of document model "${name}"`,
    repair: () =>
      "Rename the document model, so its subgraph takes a name no core subgraph holds.",
  },
  "unservable subgraph": {
    subject: (name) =>
      `The server registers the subgraph of document model "${name}" but cannot serve it`,
    repair: ({ name, supplier }) =>
      supplier === undefined
        ? "Make every version of the document model define its types the same way, or retire the version that differs."
        : `Document model "${supplier.name}"${supplier.name === name ? ` (${supplier.id})` : ""} is listed first under the same schema name and supplies the generated types, so rename one of the two models.`,
  },
};

export function describeRefusedDocumentModel(
  model: RefusedDocumentModel,
): SubgraphWarning {
  const { name, kind, reason } = model;
  const { subject, repair } = REFUSED_MODEL_WORDING[kind];
  return {
    code: "PH-DM-GRAPHQL-REFUSED",
    message: sentence(`${subject(name)}: it ${reason}`),
    repair: repair(model),
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
    case "generated": {
      const byOwner = Map.groupBy(conflict.claims, ({ owner }) => owner);
      const generators = Array.from(
        byOwner,
        ([owner, claims]) =>
          `${listed(claims.map(({ claim }) => claim))}, which ${owner === DOCUMENT_MODEL_SCHEMA_OWNER ? "the document-model schema" : `document model "${owner}"`} generates`,
      );
      return [
        {
          code: "PH-SG-GENERATED-TYPE-TAKEN",
          message: `Subgraph "${name}" defines ${generators.join(", and ")}, so the server refuses it.`,
          repair: "Rename those types in this subgraph.",
        },
      ];
    }
    case "unbuildable":
      return [
        {
          code: "PH-SG-SCHEMA-INVALID",
          message: sentence(
            `Subgraph "${name}" does not build, so the server does not serve it: ${conflict.message}`,
          ),
          repair: "Fix its schema so it builds, or declare the missing type.",
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
