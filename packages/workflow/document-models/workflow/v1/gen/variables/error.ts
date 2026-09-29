export type ErrorCode =
  | "SecretVariableValueError"
  | "DuplicateVariableKeyError"
  | "VariableNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class SecretVariableValueError extends Error implements ReducerError {
  errorCode = "SecretVariableValueError" as ErrorCode;
  constructor(message = "SecretVariableValueError") {
    super(message);
  }
}

export class DuplicateVariableKeyError extends Error implements ReducerError {
  errorCode = "DuplicateVariableKeyError" as ErrorCode;
  constructor(message = "DuplicateVariableKeyError") {
    super(message);
  }
}

export class VariableNotFoundError extends Error implements ReducerError {
  errorCode = "VariableNotFoundError" as ErrorCode;
  constructor(message = "VariableNotFoundError") {
    super(message);
  }
}

export const errors = {
  SetVariable: { SecretVariableValueError, DuplicateVariableKeyError },

  RemoveVariable: { VariableNotFoundError },
};
