import type { PHAuthState, PHBaseState, PHDocumentState } from "./types.js";

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
    version: "1.0.0",
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
