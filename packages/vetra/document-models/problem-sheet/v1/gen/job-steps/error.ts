export type ErrorCode = "DuplicateJobStepIdError" | "JobStepNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateJobStepIdError extends Error implements ReducerError {
  errorCode = "DuplicateJobStepIdError" as ErrorCode;
  constructor(message = "DuplicateJobStepIdError") {
    super(message);
  }
}

export class JobStepNotFoundError extends Error implements ReducerError {
  errorCode = "JobStepNotFoundError" as ErrorCode;
  constructor(message = "JobStepNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddJobStep: { DuplicateJobStepIdError },
  UpdateJobStep: { JobStepNotFoundError },
};
