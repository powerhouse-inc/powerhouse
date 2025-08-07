import {
  ActionContext,
  ActionSigner,
  AppActionSigner,
  Signature,
  UserActionSigner,
  type Action,
  type Operation,
} from "./types.js";
import { generateId } from "./utils/crypto.js";

export const operationFromAction = (
  action: Action,
  index: number,
  skip: number,
): Operation => {
  return {
    ...action,
    action,
    id: generateId(),
    timestamp: new Date().toISOString(),
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
