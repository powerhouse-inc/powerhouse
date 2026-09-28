export type ErrorCode = "WorkflowNotPublishedError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class WorkflowNotPublishedError extends Error implements ReducerError {
  errorCode = "WorkflowNotPublishedError" as ErrorCode;
  constructor(message = "WorkflowNotPublishedError") {
    super(message);
  }
}

export const errors = {
  SetWorkflowStatus: { WorkflowNotPublishedError },
};
