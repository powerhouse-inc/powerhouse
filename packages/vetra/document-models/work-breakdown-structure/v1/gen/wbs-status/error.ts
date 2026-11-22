export type ErrorCode = "InvalidWbsTransitionError" | "TasksNotCompleteError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidWbsTransitionError extends Error implements ReducerError {
  errorCode = "InvalidWbsTransitionError" as ErrorCode;
  constructor(message = "InvalidWbsTransitionError") {
    super(message);
  }
}

export class TasksNotCompleteError extends Error implements ReducerError {
  errorCode = "TasksNotCompleteError" as ErrorCode;
  constructor(message = "TasksNotCompleteError") {
    super(message);
  }
}

export const errors = {
  ActivateWbs: { InvalidWbsTransitionError },
  CompleteWbs: { TasksNotCompleteError },
};
