export type ErrorCode = "LastTestTargetNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class LastTestTargetNotFoundError extends Error implements ReducerError {
  errorCode = "LastTestTargetNotFoundError" as ErrorCode;
  constructor(message = "LastTestTargetNotFoundError") {
    super(message);
  }
}

export const errors = {
  SetLastTest: { LastTestTargetNotFoundError },
};
