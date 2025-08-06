import {
  Action,
  Operation,
  OperationSignatureContext,
  Signature,
} from "./types.js";
import { generateId } from "./utils/crypto.js";

export const operationFromAction = (
  action: Action,
  index: number,
  skip: number,
): Operation => {
  return {
    ...action,
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

export const operationWithSignature = (
  operation: Operation,
  signature: Signature,
): Operation => {
  if (!operation.action) {
    throw new Error("Operation has no action");
  }

  if (!operation.action.context) {
    throw new Error("Operation has no context");
  }

  if (!operation.action.context.signer) {
    throw new Error("Operation has no signer");
  }

  const action = operation.action;
  const context = action.context!;
  const signer = context.signer!;
  const signatures = signer.signatures ?? [];

  return {
    ...operation,
    action: {
      ...action,
      context: {
        ...context,
        signer: {
          ...signer,
          signatures: [...signatures, signature],
        },
      },
    },
  };
};

export const operationWithSignatureDeprecated = (
  operation: Operation,
  context: Omit<OperationSignatureContext, "operation" | "previousStateHash">,
  signature: Signature,
): Operation => {
  return {
    ...operation,
    context: {
      ...operation.context,
      signer: {
        ...operation.context?.signer,
        ...context.signer,
        signatures: [...(context.signer.signatures ?? []), signature],
      },
    },
  } as Operation;
};
