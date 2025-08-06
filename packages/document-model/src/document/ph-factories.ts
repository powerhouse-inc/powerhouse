import { Action, Operation } from "./types.js";
import { generateId } from "./utils/crypto.js";

type OperationFromActionParams = {
  action: Action;
  scope: string;
  index: number;
  skip: number;
};

export const operationFromAction = ({
  action,
  scope,
  index,
  skip,
}: OperationFromActionParams): Operation => {
  return {
    ...action,
    id: generateId(),
    timestamp: new Date().toISOString(),
    index,
    skip,
    scope,
    hash: "",
    error: undefined,
  };
};

type OperationFromOperationParams = {
  operation: Operation;
  skip: number;
};

export const operationFromOperation = ({
  operation,
  skip,
}: OperationFromOperationParams): Operation => {
  return {
    ...operation,
    skip,
    hash: "",
    error: undefined,
  };
};
