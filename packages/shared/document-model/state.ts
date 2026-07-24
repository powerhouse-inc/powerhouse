import { HASH_ALGORITHM_SHA1, HASH_ENCODING_BASE64 } from "./constants.js";
import type { HashConfig } from "./signatures.js";
import type {
  DocumentModelGlobalState,
  DocumentModelLocalState,
  DocumentModelPHState,
} from "./types.js";

/**
 * Creates a default PHAuthState
 */
export function defaultAuthState(): PHAuthState {
  return {
    version: 0,
    grants: [],
  };
}

/**
 * Creates a default PHDocumentState
 */
export function defaultDocumentState(): PHDocumentState {
  return {
    version: 0,
    hash: {
      algorithm: HASH_ALGORITHM_SHA1,
      encoding: HASH_ENCODING_BASE64,
    },
  };
}
/**
 * Creates a default PHBaseState with auth and document properties
 */
export function defaultBaseState(): PHBaseState {
  return {
    auth: defaultAuthState(),
    document: defaultDocumentState(),
  };
}

/**
 * Creates a PHAuthState with the given properties
 */
export function createAuthState(auth?: Partial<PHAuthState>): PHAuthState {
  return {
    ...defaultAuthState(),
    ...auth,
  };
}

/**
 * Creates a PHDocumentState with the given properties
 */
export function createDocumentState(
  document?: Partial<PHDocumentState>,
): PHDocumentState {
  return {
    ...defaultDocumentState(),
    ...document,
  };
}

/**
 * Creates a PHBaseState with the given auth and document properties
 */
export function createBaseState(
  auth?: Partial<PHAuthState>,
  document?: Partial<PHDocumentState>,
): PHBaseState {
  return {
    auth: createAuthState(auth),
    document: createDocumentState(document),
  };
}

/**
 * Backfills the auth scope to the default for legacy documents serialized with
 * an empty `auth`. Replaces only `state.auth`. Idempotent.
 */
export function backfillAuthState<TState extends PHBaseState>(
  state: TState,
): TState {
  return {
    ...state,
    auth: createAuthState(state.auth),
  } as TState;
}

/**
 * The document state of the document.
 */
export type PHDocumentState = {
  /**
   * The current document model schema version of the document. This is used
   * with the UPGRADE_DOCUMENT operation to specify the DocumentModelModule
   * version to use for reducer execution.
   */
  version: number;

  /** Hash configuration for operation state verification */
  hash: HashConfig;

  /** True if and only if the document has been deleted */
  isDeleted?: boolean;

  /** The timestamp when the document was deleted, in UTC ISO format */
  deletedAtUtcIso?: string;

  /** Optional: who deleted the document */
  deletedBy?: string;

  /** Optional: reason for deletion */
  deletionReason?: string;
};

/**
 * The document's authorization policy: an ordered, stacked list of grants,
 * where the last matching grant wins. `{ version: 0, grants: [] }` is
 * uninitialized and leaves the document open.
 */
export type PHAuthState = {
  /**
   * Policy language version. 0 is the uninitialized state; INITIALIZE_AUTH
   * sets an integer >= 1.
   */
  version: number;
  grants: Grant[];
  /**
   * The did:key of the auth-policy creator, captured from the INITIALIZE_AUTH
   * signer. The creator may always administer the auth scope, so a grant policy
   * can never lock administration out of itself. Absent for an unsigned genesis.
   */
  creator?: string;
};

export type Grant = {
  /** Stable id. */
  id: string;
  description: string;
  effect: "allow" | "deny";
  principal: Principal;
  capability: Capability;
  /**
   * The grant applies only when this condition holds. Until conditions are
   * evaluated, a grant carrying one never applies.
   */
  where?: Condition;
};

export type Principal =
  | { anyone: true }
  | { address: string }
  | { group: string }
  | { match: Condition };

export type Capability =
  | { can: "read"; scope?: string }
  | { can: "execute"; scope?: string; operation?: string[] };

/**
 * Boolean condition language for grants: deterministic, total, and
 * JSON-serializable, versioned by `PHAuthState.version`. Defined now but not
 * yet evaluated or enforced.
 */
export type Condition =
  | { eq: [Operand, Operand] }
  | { ne: [Operand, Operand] }
  | { in: [Operand, Operand[]] }
  | { notIn: [Operand, Operand[]] }
  | { lt: [Operand, Operand] }
  | { lte: [Operand, Operand] }
  | { gt: [Operand, Operand] }
  | { gte: [Operand, Operand] }
  | { exists: Operand }
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition };

/**
 * A condition operand: `attr` is a dotted path into the decision context
 * (e.g. "doc.global.status", "subject.address"); `lit` is a constant value.
 */
export type Operand =
  | { attr: string }
  | { lit: string | number | boolean | null };

/**
 * The base state of the document.
 */
export type PHBaseState = {
  /** Carries authentication information. */
  auth: PHAuthState;

  /** Carries information about the document. */
  document: PHDocumentState;
};

export function defaultGlobalState(): DocumentModelGlobalState {
  return {
    ...defaultBaseState(),
    author: {
      name: "",
      website: "",
    },
    description: "",
    extension: "",
    id: "",
    name: "",
    specifications: [],
  };
}

export function defaultLocalState(): DocumentModelLocalState {
  return {};
}

export function defaultPHState(): DocumentModelPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<DocumentModelGlobalState>,
): DocumentModelGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as DocumentModelGlobalState;
}

export function createLocalState(
  state?: Partial<DocumentModelLocalState>,
): DocumentModelLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as DocumentModelLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<DocumentModelGlobalState>,
  localState?: Partial<DocumentModelLocalState>,
): DocumentModelPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}
