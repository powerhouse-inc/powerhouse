import type { PHAuthState, PHBaseState, PHDocumentState } from "./ph-types.js";
import type {
  Action,
  ActionContext,
  ActionSigner,
  AppActionSigner,
  Operation,
  Signature,
  UserActionSigner,
} from "./types.js";
import { generateId } from "./utils/crypto.js";

/**
 * This function should be used instead of { ...action } to ensure
 * that extra properties are not included in the action.
 */
export const actionFromAction = (action: Action): Action => {
  return {
    id: action.id,
    timestampUtcMs: action.timestampUtcMs,
    type: action.type,
    input: action.input,
    scope: action.scope,
    context: action.context,
    attachments: action.attachments,
  };
};

export const operationFromAction = (
  action: Action,
  index: number,
  skip: number,
): Operation => {
  return {
    ...action,
    action,
    id: generateId(),
    timestampUtcMs: new Date().toISOString(),
    hash: "",
    error: undefined,

    index,
    skip,
  };
};

export const operationFromOperation = (
  operation: Operation,
  skip: number,
): Operation => {
  return {
    ...operation,
    hash: "",
    error: undefined,
    skip,
  };
};

export const operationWithContext = (
  operation: Operation,
  context: ActionContext,
): Operation => {
  if (!operation.action) {
    throw new Error("Operation has no action");
  }

  return {
    ...operation,
    action: {
      ...operation.action,
      context,
    },
  };
};

export const actionContext = (): ActionContext => ({});

export const actionSigner = (
  user: UserActionSigner,
  app: AppActionSigner,
  signatures: Signature[] = [],
): ActionSigner => ({
  user,
  app,
  signatures,
});

/**
 * Creates a default PHAuthState
 */
export const defaultAuthState = (): PHAuthState => ({});

/**
 * Creates a default PHDocumentState
 */
export const defaultDocumentState = (): PHDocumentState => ({
  version: "1.0.0",
});

/**
 * Creates a default PHBaseState with auth and document properties
 */
export const defaultBaseState = (): PHBaseState => ({
  auth: defaultAuthState(),
  document: defaultDocumentState(),
});

/**
 * Creates a PHAuthState with the given properties
 */
export const createAuthState = (auth?: Partial<PHAuthState>): PHAuthState => ({
  ...defaultAuthState(),
  ...auth,
});

/**
 * Creates a PHDocumentState with the given properties
 */
export const createDocumentState = (
  document?: Partial<PHDocumentState>,
): PHDocumentState => ({
  ...defaultDocumentState(),
  ...document,
});

/**
 * Creates a PHBaseState with the given auth and document properties
 */
export const createBaseState = (
  auth?: Partial<PHAuthState>,
  document?: Partial<PHDocumentState>,
): PHBaseState => ({
  auth: createAuthState(auth),
  document: createDocumentState(document),
});
