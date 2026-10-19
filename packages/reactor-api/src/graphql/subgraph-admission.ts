import {
  type DocumentModelSchema,
  type DocumentModelSource,
  type ReservedTypeNames,
  type ResolvedDocumentModelSchema,
  reservedTypeNamesTaken,
} from "../utils/create-schema.js";
import {
  type OwnershipConflict,
  resolveClaimOwnership,
  type SubgraphClaims,
} from "./subgraph-type-ownership.js";

/** Where a subgraph came from; a package origin is the package name. */
export const CORE_ORIGIN = Symbol("core");
export const DOCUMENT_MODEL_ORIGIN = Symbol("document-models");
export const HOST_ORIGIN = Symbol("host");
export type SubgraphOrigin =
  | string
  | typeof CORE_ORIGIN
  | typeof DOCUMENT_MODEL_ORIGIN
  | typeof HOST_ORIGIN;

export function describeOrigin(origin: SubgraphOrigin): string {
  if (origin === CORE_ORIGIN) return "core";
  if (origin === DOCUMENT_MODEL_ORIGIN) return "document models";
  if (origin === HOST_ORIGIN) return "the host";
  return `package ${origin}`;
}

function rank(origin: SubgraphOrigin): number {
  if (origin === CORE_ORIGIN) return 3;
  if (origin === HOST_ORIGIN) return 2;
  if (origin === DOCUMENT_MODEL_ORIGIN) return 1;
  return 0;
}

export type DocumentModelRefusal<T> = {
  model: T;
  key: string;
  /** Only the model's own subgraph is refused; its generated types stay. */
  subgraphOnly: boolean;
  reason: string;
};

export type DocumentModelAdmission<T> = {
  admitted: T[];
  schemas: Map<T, DocumentModelSchema>;
  refusals: DocumentModelRefusal<T>[];
};

/** Models whose schemas build and take no reserved name. */
export function admitDocumentModels<T extends DocumentModelSource>(
  resolved: readonly ResolvedDocumentModelSchema<T>[],
  reserved: ReservedTypeNames,
): DocumentModelAdmission<T> {
  const admission: DocumentModelAdmission<T> = {
    admitted: [],
    schemas: new Map(),
    refusals: [],
  };
  for (const { model, key, schema, error } of resolved) {
    const refuse = (reason: string, subgraphOnly = false) =>
      admission.refusals.push({ model, key, subgraphOnly, reason });
    if (!schema) {
      refuse(`has an unusable schema: ${error.message}`);
      continue;
    }
    const taken = reservedTypeNamesTaken(model, reserved, schema.generated);
    if (taken.length > 0) {
      refuse(`generates reserved type names: ${taken.join(", ")}`);
      continue;
    }
    if (schema.subgraphError) {
      refuse(
        `has an unusable subgraph schema: ${schema.subgraphError.message}`,
        true,
      );
    }
    admission.schemas.set(model, schema);
    admission.admitted.push(model);
  }
  return admission;
}

const DOCUMENT_MODELS_TO_EXCLUDE: string[] = [];

/** The latest version of each document model. */
function filterLatestDocumentModelVersions<T extends DocumentModelSource>(
  documentModels: readonly T[],
): T[] {
  const latestByName = new Map<string, T>();

  for (const documentModel of documentModels) {
    const name = documentModel.documentModel.global.name;
    const existing = latestByName.get(name);

    if (!existing) {
      latestByName.set(name, documentModel);
      continue;
    }

    const currentVersion =
      documentModel.documentModel.global.specifications.at(-1)?.version ?? 0;
    const existingVersion =
      existing.documentModel.global.specifications.at(-1)?.version ?? 0;

    if (currentVersion > existingVersion) {
      latestByName.set(name, documentModel);
    }
  }

  return Array.from(latestByName.values());
}

/** The admitted models that serve a subgraph of their own, with its types. */
export function documentModelSubgraphSources<T extends DocumentModelSource>(
  admitted: readonly T[],
  schemas: ReadonlyMap<T, DocumentModelSchema>,
): { model: T; types: NonNullable<DocumentModelSchema["subgraph"]> }[] {
  const sources: {
    model: T;
    types: NonNullable<DocumentModelSchema["subgraph"]>;
  }[] = [];
  for (const model of filterLatestDocumentModelVersions(admitted)) {
    if (DOCUMENT_MODELS_TO_EXCLUDE.includes(model.documentModel.global.id)) {
      continue;
    }
    const types = schemas.get(model)?.subgraph;
    if (types) sources.push({ model, types });
  }
  return sources;
}

export type Admission<T> =
  | { action: "skip" }
  | { action: "reject"; reason: "core name" }
  | { action: "reject"; reason: "rank"; holderOrigin: SubgraphOrigin }
  | { action: "reject"; reason: "collision"; collisions: string[] }
  | { action: "add"; replaces: T[]; evicts: T[] };

/** Same origin replaces, higher rank evicts, else refused; core names never move (#2972). */
export function decideAdmission<T>(
  candidate: T,
  origin: SubgraphOrigin,
  holders: readonly { holder: T; origin: SubgraphOrigin }[],
  collisions: () => string[],
): Admission<T> {
  if (
    origin !== CORE_ORIGIN &&
    holders.some((holder) => holder.origin === CORE_ORIGIN)
  ) {
    return { action: "reject", reason: "core name" };
  }
  if (holders.some(({ holder }) => holder === candidate)) {
    return { action: "skip" };
  }
  const rivals = holders.filter((holder) => holder.origin !== origin);
  for (const rival of rivals) {
    if (rank(origin) <= rank(rival.origin)) {
      return { action: "reject", reason: "rank", holderOrigin: rival.origin };
    }
  }
  const found = origin === CORE_ORIGIN ? [] : collisions();
  if (found.length > 0) {
    return { action: "reject", reason: "collision", collisions: found };
  }
  return {
    action: "add",
    replaces: holders
      .filter((holder) => holder.origin === origin)
      .map(({ holder }) => holder),
    evicts: rivals.map(({ holder }) => holder),
  };
}

/** The order origins first registered in, and names within each. */
export class RegistrationOrder {
  readonly #origins = new Map<
    SubgraphOrigin,
    { order: number; names: Map<string, number> }
  >();

  record(origin: SubgraphOrigin, name: string): void {
    let entry = this.#origins.get(origin);
    if (!entry) {
      entry = { order: this.#origins.size, names: new Map() };
      this.#origins.set(origin, entry);
    }
    if (!entry.names.has(name)) entry.names.set(name, entry.names.size);
  }

  of(origin: SubgraphOrigin, name: string): [number, number] {
    const entry = this.#origins.get(origin);
    return [entry?.order ?? Infinity, entry?.names.get(name) ?? Infinity];
  }
}

export type SupergraphMember<T> = {
  member: T;
  name: string;
  origin: SubgraphOrigin;
  claims: SubgraphClaims;
};

/** Members that lose a claim: claims go by rank, then first registration. */
export function supergraphClaimLosers<T>(
  members: Iterable<SupergraphMember<T>>,
  order: RegistrationOrder,
): Map<T, OwnershipConflict[]> {
  const ranked = Array.from(members, (member) => ({
    member,
    priority: [-rank(member.origin), ...order.of(member.origin, member.name)],
  })).sort((a, b) => {
    const i = a.priority.findIndex((value, j) => value !== b.priority[j]);
    return i === -1 ? 0 : a.priority[i] - b.priority[i];
  });
  return resolveClaimOwnership(
    ranked.map(({ member }) => ({
      candidate: member.member,
      name: member.name,
      claims: member.claims,
    })),
  );
}
