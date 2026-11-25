export type ErrorCode =
  | "DuplicateOutcomeTargetIdError"
  | "OutcomeTargetNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateOutcomeTargetIdError
  extends Error
  implements ReducerError
{
  errorCode = "DuplicateOutcomeTargetIdError" as ErrorCode;
  constructor(message = "DuplicateOutcomeTargetIdError") {
    super(message);
  }
}

export class OutcomeTargetNotFoundError extends Error implements ReducerError {
  errorCode = "OutcomeTargetNotFoundError" as ErrorCode;
  constructor(message = "OutcomeTargetNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddOutcomeTarget: { DuplicateOutcomeTargetIdError },
  UpdateOutcomeTarget: { OutcomeTargetNotFoundError },
};
