import {
  type PHAuthState,
  type PHBaseState,
  type PHDocumentState,
} from "./ph-types.js";
import {
  type Action,
  type ActionContext,
  type ActionSigner,
  type AppActionSigner,
  type Operation,
  type Signature,
  type UserActionSigner,
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
export const authState = (): PHAuthState => ({});

/**
 * Creates a default PHDocumentState
 */
export const documentState = (): PHDocumentState => ({
  version: "1.0.0",
});

/**
 * Creates a default PHBaseState with auth and document properties
 */
export const baseState = (): PHBaseState => ({
  auth: authState(),
  document: documentState(),
});
