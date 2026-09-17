export type ErrorCode = "VariableNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class VariableNotFoundError extends Error implements ReducerError {
  errorCode = "VariableNotFoundError" as ErrorCode;
  constructor(message = "VariableNotFoundError") {
    super(message);
  }
}

export const errors = {
  RemoveVariable: { VariableNotFoundError },
};
