import type { PHDocumentHeader } from "./documents.js";
import type { Supports } from "./peer-agreement.js";
import type { ProtocolVersions } from "./signature-policy.js";
import { stateReducerOf } from "./state-reducer.js";
import type {
  CreateDocumentActionInput,
  DocumentModelModule,
} from "./types.js";

export const BASE_REDUCER_VERSIONS = [1, 2, 3] as const;
export type BaseReducerVersion = (typeof BASE_REDUCER_VERSIONS)[number];

/** What UNDO and REDO become. */
export type UndoModel = "skip" | "noop-chain" | "retraction";
/** Whether a stored skip can be an undo, or is only a replica's rewind. */
export type SkipMeaning = "undo-or-rewind" | "rewind";
/** How same-timestamp actions are ordered. */
export type TieOrder = "rank-locale" | "canonical";
/** How a synthesized row's action id derives from its source's. */
export type SynthesizedIdForm = "hashed" | "suffixed";
/** Whose state hash a received row keeps. */
export type ReplayHash = "sender" | "receiver";

export type BaseReducerCapabilities = {
  readonly version: BaseReducerVersion;
  readonly undo: UndoModel;
  /** The retraction rule derives every scope outside RULE_EXEMPT_SCOPES. */
  readonly retractionRule: boolean;
  readonly skip: SkipMeaning;
  readonly tieOrder: TieOrder;
  readonly synthesizedId: SynthesizedIdForm;
  readonly replayHash: ReplayHash;
  /** Runs only models whose every registered reducer createReducer tagged. */
  readonly needsStateReducer: boolean;
};

const CAPABILITIES = {
  1: {
    version: 1,
    undo: "skip",
    retractionRule: false,
    skip: "undo-or-rewind",
    tieOrder: "rank-locale",
    synthesizedId: "hashed",
    replayHash: "sender",
    needsStateReducer: false,
  },
  2: {
    version: 2,
    undo: "noop-chain",
    retractionRule: false,
    skip: "undo-or-rewind",
    tieOrder: "rank-locale",
    synthesizedId: "hashed",
    replayHash: "sender",
    needsStateReducer: false,
  },
  3: {
    version: 3,
    undo: "retraction",
    retractionRule: true,
    skip: "rewind",
    tieOrder: "canonical",
    synthesizedId: "suffixed",
    replayHash: "receiver",
    needsStateReducer: true,
  },
} as const satisfies {
  readonly [V in BaseReducerVersion]: BaseReducerCapabilities & {
    readonly version: V;
  };
};

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

/** Whether the retraction rule derives `scope`. */
export function derivesByRule(
  caps: BaseReducerCapabilities | undefined,
  scope: string,
): boolean {
  return caps?.retractionRule === true && !RULE_EXEMPT_SCOPES.has(scope);
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
  if (!caps.needsStateReducer) return true;
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
