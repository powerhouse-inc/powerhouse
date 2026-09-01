export type ErrorCode = "TriggerNotSetError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class TriggerNotSetError extends Error implements ReducerError {
  errorCode = "TriggerNotSetError" as ErrorCode;
  constructor(message = "TriggerNotSetError") {
    super(message);
  }
}

export const errors = {
  ClearTrigger: { TriggerNotSetError },
};
