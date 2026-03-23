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
  return {};
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
 * The authentication state of the document.
 *
 * This has yet to be implemented.
 */
export type PHAuthState = {};

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
