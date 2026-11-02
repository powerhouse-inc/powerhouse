import type { PHDocumentHeader } from "./documents.js";
import type { PeerCapabilityFlags, Supports } from "./peer-agreement.js";
import type { ProtocolVersions } from "./signature-policy.js";
import { stateReducerOf } from "./state-reducer.js";
import type {
  CreateDocumentActionInput,
  DocumentModelModule,
} from "./types.js";

export const BASE_REDUCER_VERSIONS = [1, 2, 3] as const;
export type BaseReducerVersion = (typeof BASE_REDUCER_VERSIONS)[number];

// Each axis is the keys of an interface, so declaration merging can add a value.

export interface UndoModelValues {
  skip: true;
  "noop-chain": true;
  retraction: true;
}
/** What UNDO and REDO become. */
export type UndoModel = keyof UndoModelValues;

export interface SkipMeaningValues {
  "undo-or-rewind": true;
  rewind: true;
}
/** Whether a stored skip can be an undo, or is only a replica's rewind. */
export type SkipMeaning = keyof SkipMeaningValues;

export interface TieOrderValues {
  "rank-locale": true;
  canonical: true;
}
/** How same-timestamp actions are ordered. */
export type TieOrder = keyof TieOrderValues;

export interface SynthesizedIdFormValues {
  hashed: true;
  none: true;
}
/** How a synthesized row's action id derives from its source's; "none" synthesizes nothing. */
export type SynthesizedIdForm = keyof SynthesizedIdFormValues;

export interface ReplayHashValues {
  sender: true;
  receiver: true;
}
/** Whose state hash a received row keeps. */
export type ReplayHash = keyof ReplayHashValues;

export interface DerivationModelValues {
  replay: true;
  "retraction-rule": true;
}
/** How a scope's state derives from its rows. */
export type DerivationModel = keyof DerivationModelValues;

export interface ReducerContractValues {
  any: true;
  "state-reducer": true;
}
/** Which registered reducers a version runs. */
export type ReducerContract = keyof ReducerContractValues;

export interface GatingFlagValues {
  undoV3: true;
}
/** A reactor feature flag a version runs only under. */
export type GatingFlag = keyof GatingFlagValues;

export type BaseReducerCapabilities = {
  readonly version: BaseReducerVersion;
  readonly undo: UndoModel;
  /** "retraction-rule" derives every scope outside RULE_EXEMPT_SCOPES by the rule. */
  readonly derivation: DerivationModel;
  readonly skip: SkipMeaning;
  readonly tieOrder: TieOrder;
  readonly synthesizedId: SynthesizedIdForm;
  readonly replayHash: ReplayHash;
  /** "state-reducer" runs only models whose every registered reducer createReducer tagged. */
  readonly reducerContract: ReducerContract;
  /** The flag this version runs only under; null runs always. */
  readonly gatedBy: GatingFlag | null;
};

const CAPABILITIES = {
  1: {
    version: 1,
    undo: "skip",
    derivation: "replay",
    skip: "undo-or-rewind",
    tieOrder: "rank-locale",
    synthesizedId: "hashed",
    replayHash: "sender",
    reducerContract: "any",
    gatedBy: null,
  },
  2: {
    version: 2,
    undo: "noop-chain",
    derivation: "replay",
    skip: "undo-or-rewind",
    tieOrder: "rank-locale",
    synthesizedId: "hashed",
    replayHash: "sender",
    reducerContract: "any",
    gatedBy: null,
  },
  3: {
    version: 3,
    undo: "retraction",
    derivation: "retraction-rule",
    skip: "rewind",
    tieOrder: "canonical",
    synthesizedId: "none",
    replayHash: "receiver",
    reducerContract: "state-reducer",
    gatedBy: "undoV3",
  },
} as const satisfies {
  readonly [V in BaseReducerVersion]: BaseReducerCapabilities & {
    readonly version: V;
  };
};

/** The versions a reactor running `flags` supports. */
export function baseReducerVersionsFor(
  flags: PeerCapabilityFlags,
): BaseReducerVersion[] {
  return BASE_REDUCER_VERSIONS.filter((version) => {
    const gate = CAPABILITIES[version].gatedBy;
    return gate === null || flags[gate] === true;
  });
}

/** Flags under which this build runs every version it knows. */
export const FLAGS_FOR_EVERY_VERSION: { readonly [F in GatingFlag]: true } =
  Object.fromEntries(
    BASE_REDUCER_VERSIONS.flatMap((version) => {
      const gate = CAPABILITIES[version].gatedBy;
      return gate === null ? [] : [[gate, true]];
    }),
  ) as { readonly [F in GatingFlag]: true };

/** Scopes the retraction rule never derives. */
export const RULE_EXEMPT_SCOPES: ReadonlySet<string> = new Set([
  "auth",
  "document",
]);

export function assertNever(value: never, what: string): never {
  throw new Error(`Unhandled ${what}: ${String(value)}`);
}

export function isBaseReducerVersion(
  value: unknown,
): value is BaseReducerVersion {
  return (BASE_REDUCER_VERSIONS as readonly unknown[]).includes(value);
}

export function capabilitiesOf(
  version: BaseReducerVersion,
): BaseReducerCapabilities {
  return CAPABILITIES[version];
}

/** Throws on a missing version: defaulting one would replay through the wrong reducer. */
export function baseReducerVersion(
  header: PHDocumentHeader,
): BaseReducerVersion {
  const version = header.protocolVersions?.["base-reducer"];

  if (typeof version !== "number") {
    throw new Error(
      `Document ${header.id} carries no base-reducer protocol version`,
    );
  }

  if (!isBaseReducerVersion(version)) {
    throw new Error(
      `Document ${header.id} carries unknown base-reducer protocol version ${version}`,
    );
  }

  return version;
}

/** Throws on a missing or unknown version. */
export function baseReducerCapabilities(
  header: PHDocumentHeader,
): BaseReducerCapabilities {
  return capabilitiesOf(baseReducerVersion(header));
}

/** Undefined only for a header without a version; throws on an unknown one. */
export function optionalBaseReducerCapabilities(
  header: PHDocumentHeader,
): BaseReducerCapabilities | undefined {
  if (header.protocolVersions?.["base-reducer"] === undefined) {
    return undefined;
  }
  return baseReducerCapabilities(header);
}

/** Undefined when `versions` names no known base-reducer version. */
export function capabilitiesFor(
  versions: ProtocolVersions | undefined,
): BaseReducerCapabilities | undefined {
  const version = versions?.["base-reducer"];
  return isBaseReducerVersion(version) ? capabilitiesOf(version) : undefined;
}

/** From CREATE_DOCUMENT input; undefined when it names no known version. */
export function createdCapabilities(
  input: Partial<CreateDocumentActionInput> | undefined,
): BaseReducerCapabilities | undefined {
  return capabilitiesFor(input?.protocolVersions);
}

/** One answer per value of a capability axis; a new value fails to compile here. */
type Decision<A extends string, R> = { readonly [K in A]: R };

/**
 * Every decision a consumer may take on a capability axis. Outside this module
 * and the other protocol owners, an axis is read only through these or through
 * an exhaustive switch.
 */
export const CAPABILITY_DECISIONS = {
  usesRetractionRule: {
    replay: false,
    "retraction-rule": true,
  } satisfies Decision<DerivationModel, boolean>,
  needsTaggedModel: {
    any: false,
    "state-reducer": true,
  } satisfies Decision<ReducerContract, boolean>,
  sortsJobsCanonically: {
    "rank-locale": false,
    canonical: true,
  } satisfies Decision<TieOrder, boolean>,
  conflictWindowMovesEveryRow: {
    "rank-locale": false,
    canonical: true,
  } satisfies Decision<TieOrder, boolean>,
  skipMayUndo: {
    "undo-or-rewind": true,
    rewind: false,
  } satisfies Decision<SkipMeaning, boolean>,
} as const;

// A header without a version runs v1/v2's rules on every axis read here.
const UNVERSIONED = CAPABILITIES[1];

/** Whether the version derives scopes by the retraction rule; a versionless header does not. */
export function usesRetractionRule(
  caps: BaseReducerCapabilities | undefined,
): boolean {
  return CAPABILITY_DECISIONS.usesRetractionRule[
    (caps ?? UNVERSIONED).derivation
  ];
}

/** Whether the retraction rule derives `scope`. */
export function derivesByRule(
  caps: BaseReducerCapabilities | undefined,
  scope: string,
): boolean {
  return usesRetractionRule(caps) && !RULE_EXEMPT_SCOPES.has(scope);
}

/** Whether the retraction rule derives `scope` of the document `header` heads. */
export function documentDerivesByRule(
  header: PHDocumentHeader,
  scope: string,
): boolean {
  return derivesByRule(optionalBaseReducerCapabilities(header), scope);
}

/** Whether the version runs only models whose every reducer is tagged. */
export function needsTaggedModel(
  caps: BaseReducerCapabilities | undefined,
): boolean {
  return CAPABILITY_DECISIONS.needsTaggedModel[
    (caps ?? UNVERSIONED).reducerContract
  ];
}

/** How same-timestamp actions are ordered; a versionless header ranks and compares by locale. */
export function tieOrderOf(
  caps: BaseReducerCapabilities | undefined,
): TieOrder {
  return (caps ?? UNVERSIONED).tieOrder;
}

/** Whether a job's actions are stored in canonical order rather than as submitted. */
export function sortsJobsCanonically(
  caps: BaseReducerCapabilities | undefined,
): boolean {
  return CAPABILITY_DECISIONS.sortsJobsCanonically[tieOrderOf(caps)];
}

/** Whether every conflicting row of a load moves, rather than only those past the predecessor bound. */
export function conflictWindowMovesEveryRow(
  caps: BaseReducerCapabilities | undefined,
): boolean {
  return CAPABILITY_DECISIONS.conflictWindowMovesEveryRow[tieOrderOf(caps)];
}

/** Whether a stored skip may be an undo, not only a replica's rewind. */
export function skipMayUndo(
  caps: BaseReducerCapabilities | undefined,
): boolean {
  return CAPABILITY_DECISIONS.skipMayUndo[(caps ?? UNVERSIONED).skip];
}

/** Whether a stored skip in `scope` is a rewind the reducer applies. */
export function appliesRewind(
  caps: BaseReducerCapabilities,
  scope: string,
): boolean {
  return !derivesByRule(caps, scope);
}

/** Whether a submitted RETRACT is this version's undo. */
export function acceptsSubmittedRetract(
  caps: BaseReducerCapabilities,
): boolean {
  switch (caps.undo) {
    case "retraction":
      return true;
    case "skip":
    case "noop-chain":
      return false;
    default:
      return assertNever(caps.undo, "undo model");
  }
}

/** Whether a submitted UNDO or REDO is this version's undo; on retraction a client submits RETRACT. */
export function acceptsSubmittedUndoRedo(
  caps: BaseReducerCapabilities,
): boolean {
  switch (caps.undo) {
    case "skip":
    case "noop-chain":
      return true;
    case "retraction":
      return false;
    default:
      return assertNever(caps.undo, "undo model");
  }
}

/** Whether every registered version of `documentType` runs under `caps`; undefined when none is. */
export function modelRunsBaseReducer(
  caps: BaseReducerCapabilities,
  documentType: string,
  modules: readonly DocumentModelModule[],
): boolean | undefined {
  const registered = modules.filter(
    (module) => module.documentModel.global.id === documentType,
  );
  if (registered.length === 0) return undefined;
  if (!needsTaggedModel(caps)) return true;
  return registered.every(
    (module) => stateReducerOf(module.reducer) !== undefined,
  );
}

export type ProtocolSupport = Supports["protocols"];

export type ProtocolRefusal = {
  protocol: string;
  version: number;
  /** Set when the version is supported but this model cannot run it. */
  documentType?: string;
};

/** Why `versions` cannot run here; unregistered protocols and types are admitted. */
export function refusalFor(
  documentType: string | undefined,
  versions: ProtocolVersions | undefined,
  support: ProtocolSupport,
  modules: readonly DocumentModelModule[],
): ProtocolRefusal | undefined {
  for (const [protocol, version] of Object.entries(versions ?? {})) {
    const supported = support[protocol] as readonly number[] | undefined;
    if (supported === undefined || supported.includes(version)) continue;
    return { protocol, version };
  }
  const version = versions?.["base-reducer"];
  if (documentType === undefined || !isBaseReducerVersion(version)) {
    return undefined;
  }
  if (
    modelRunsBaseReducer(capabilitiesOf(version), documentType, modules) ===
    false
  ) {
    return { protocol: "base-reducer", version, documentType };
  }
  return undefined;
}
