export type ErrorCode =
  | "DuplicateConstraintIdError"
  | "ConstraintNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateConstraintIdError extends Error implements ReducerError {
  errorCode = "DuplicateConstraintIdError" as ErrorCode;
  constructor(message = "DuplicateConstraintIdError") {
    super(message);
  }
}

export class ConstraintNotFoundError extends Error implements ReducerError {
  errorCode = "ConstraintNotFoundError" as ErrorCode;
  constructor(message = "ConstraintNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddConstraint: { DuplicateConstraintIdError },
  UpdateConstraint: { ConstraintNotFoundError },
};
