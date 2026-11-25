export type ErrorCode = "DuplicateOutcomeIdError" | "OutcomeNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateOutcomeIdError extends Error implements ReducerError {
  errorCode = "DuplicateOutcomeIdError" as ErrorCode;
  constructor(message = "DuplicateOutcomeIdError") {
    super(message);
  }
}

export class OutcomeNotFoundError extends Error implements ReducerError {
  errorCode = "OutcomeNotFoundError" as ErrorCode;
  constructor(message = "OutcomeNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddOutcome: { DuplicateOutcomeIdError },
  UpdateOutcome: { OutcomeNotFoundError },
};
