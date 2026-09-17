export type ErrorCode =
  | "DuplicateStepIdError"
  | "DuplicateStepKeyError"
  | "StepNotFoundError"
  | "StepKeyConflictError"
  | "RemoveStepNotFoundError"
  | "ConfigStepNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateStepIdError extends Error implements ReducerError {
  errorCode = "DuplicateStepIdError" as ErrorCode;
  constructor(message = "DuplicateStepIdError") {
    super(message);
  }
}

export class DuplicateStepKeyError extends Error implements ReducerError {
  errorCode = "DuplicateStepKeyError" as ErrorCode;
  constructor(message = "DuplicateStepKeyError") {
    super(message);
  }
}

export class StepNotFoundError extends Error implements ReducerError {
  errorCode = "StepNotFoundError" as ErrorCode;
  constructor(message = "StepNotFoundError") {
    super(message);
  }
}

export class StepKeyConflictError extends Error implements ReducerError {
  errorCode = "StepKeyConflictError" as ErrorCode;
  constructor(message = "StepKeyConflictError") {
    super(message);
  }
}

export class RemoveStepNotFoundError extends Error implements ReducerError {
  errorCode = "RemoveStepNotFoundError" as ErrorCode;
  constructor(message = "RemoveStepNotFoundError") {
    super(message);
  }
}

export class ConfigStepNotFoundError extends Error implements ReducerError {
  errorCode = "ConfigStepNotFoundError" as ErrorCode;
  constructor(message = "ConfigStepNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddStep: { DuplicateStepIdError, DuplicateStepKeyError },

  UpdateStep: { StepNotFoundError, StepKeyConflictError },

  RemoveStep: { RemoveStepNotFoundError },

  SetStepConfig: { ConfigStepNotFoundError },
};
