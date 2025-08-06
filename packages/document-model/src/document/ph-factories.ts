import { Action, Operation } from "./types.js";
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
