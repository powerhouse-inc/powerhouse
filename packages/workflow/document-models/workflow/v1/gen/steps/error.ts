export type ErrorCode =
  | "DuplicateStepIdError"
  | "DuplicateStepKeyError"
  | "InvalidStepBlockError"
  | "StepConfigNotObjectError"
  | "StepNotFoundError"
  | "StepKeyConflictError"
  | "InvalidUpdateBlockError"
  | "UpdateConfigNotObjectError"
  | "RemoveStepNotFoundError"
  | "ConfigStepNotFoundError"
  | "SetConfigNotObjectError";

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

export class InvalidStepBlockError extends Error implements ReducerError {
  errorCode = "InvalidStepBlockError" as ErrorCode;
  constructor(message = "InvalidStepBlockError") {
    super(message);
  }
}

export class StepConfigNotObjectError extends Error implements ReducerError {
  errorCode = "StepConfigNotObjectError" as ErrorCode;
  constructor(message = "StepConfigNotObjectError") {
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

export class InvalidUpdateBlockError extends Error implements ReducerError {
  errorCode = "InvalidUpdateBlockError" as ErrorCode;
  constructor(message = "InvalidUpdateBlockError") {
    super(message);
  }
}

export class UpdateConfigNotObjectError extends Error implements ReducerError {
  errorCode = "UpdateConfigNotObjectError" as ErrorCode;
  constructor(message = "UpdateConfigNotObjectError") {
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

export class SetConfigNotObjectError extends Error implements ReducerError {
  errorCode = "SetConfigNotObjectError" as ErrorCode;
  constructor(message = "SetConfigNotObjectError") {
    super(message);
  }
}

export const errors = {
  AddStep: {
    DuplicateStepIdError,
    DuplicateStepKeyError,
    InvalidStepBlockError,
    StepConfigNotObjectError,
  },

  UpdateStep: {
    StepNotFoundError,
    StepKeyConflictError,
    InvalidUpdateBlockError,
    UpdateConfigNotObjectError,
  },

  RemoveStep: { RemoveStepNotFoundError },

  SetStepConfig: { ConfigStepNotFoundError, SetConfigNotObjectError },
};
