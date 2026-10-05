export type ErrorCode =
  | "InvalidTriggerBlockError"
  | "TriggerConfigNotObjectError"
  | "TriggerNotSetError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidTriggerBlockError extends Error implements ReducerError {
  errorCode = "InvalidTriggerBlockError" as ErrorCode;
  constructor(message = "InvalidTriggerBlockError") {
    super(message);
  }
}

export class TriggerConfigNotObjectError extends Error implements ReducerError {
  errorCode = "TriggerConfigNotObjectError" as ErrorCode;
  constructor(message = "TriggerConfigNotObjectError") {
    super(message);
  }
}

export class TriggerNotSetError extends Error implements ReducerError {
  errorCode = "TriggerNotSetError" as ErrorCode;
  constructor(message = "TriggerNotSetError") {
    super(message);
  }
}

export const errors = {
  SetTrigger: { InvalidTriggerBlockError, TriggerConfigNotObjectError },

  ClearTrigger: { TriggerNotSetError },
};
