export type ErrorCode = "InvalidStatusTransitionError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidStatusTransitionError
  extends Error
  implements ReducerError
{
  errorCode = "InvalidStatusTransitionError" as ErrorCode;
  constructor(message = "InvalidStatusTransitionError") {
    super(message);
  }
}

export const errors = {
  StartEvaluation: { InvalidStatusTransitionError },
};
