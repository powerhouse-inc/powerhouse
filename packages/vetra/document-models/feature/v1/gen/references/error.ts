export type ErrorCode =
  | "RoleNotSetError"
  | "RelatedStepNotSetError"
  | "ParentFeatureNotSetError"
  | "WbsNotSetError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class RoleNotSetError extends Error implements ReducerError {
  errorCode = "RoleNotSetError" as ErrorCode;
  constructor(message = "RoleNotSetError") {
    super(message);
  }
}

export class RelatedStepNotSetError extends Error implements ReducerError {
  errorCode = "RelatedStepNotSetError" as ErrorCode;
  constructor(message = "RelatedStepNotSetError") {
    super(message);
  }
}

export class ParentFeatureNotSetError extends Error implements ReducerError {
  errorCode = "ParentFeatureNotSetError" as ErrorCode;
  constructor(message = "ParentFeatureNotSetError") {
    super(message);
  }
}

export class WbsNotSetError extends Error implements ReducerError {
  errorCode = "WbsNotSetError" as ErrorCode;
  constructor(message = "WbsNotSetError") {
    super(message);
  }
}

export const errors = {
  UpdateRoleSnippet: { RoleNotSetError },
  UpdateRelatedStepSnippet: { RelatedStepNotSetError },
  UpdateParentFeatureSnippet: { ParentFeatureNotSetError },
  UpdateWbsSnippet: { WbsNotSetError },
};
