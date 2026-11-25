export type ErrorCode =
  | "DuplicateRoleIdError"
  | "RoleNotFoundError"
  | "SpecializedJobNotSetError"
  | "DuplicateSpecializedJobStepIdError"
  | "SpecializedJobStepNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateRoleIdError extends Error implements ReducerError {
  errorCode = "DuplicateRoleIdError" as ErrorCode;
  constructor(message = "DuplicateRoleIdError") {
    super(message);
  }
}

export class RoleNotFoundError extends Error implements ReducerError {
  errorCode = "RoleNotFoundError" as ErrorCode;
  constructor(message = "RoleNotFoundError") {
    super(message);
  }
}

export class SpecializedJobNotSetError extends Error implements ReducerError {
  errorCode = "SpecializedJobNotSetError" as ErrorCode;
  constructor(message = "SpecializedJobNotSetError") {
    super(message);
  }
}

export class DuplicateSpecializedJobStepIdError
  extends Error
  implements ReducerError
{
  errorCode = "DuplicateSpecializedJobStepIdError" as ErrorCode;
  constructor(message = "DuplicateSpecializedJobStepIdError") {
    super(message);
  }
}

export class SpecializedJobStepNotFoundError
  extends Error
  implements ReducerError
{
  errorCode = "SpecializedJobStepNotFoundError" as ErrorCode;
  constructor(message = "SpecializedJobStepNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddRole: { DuplicateRoleIdError },
  UpdateRole: { RoleNotFoundError },
  UpdateRoleSpecializedJob: { SpecializedJobNotSetError },
  AddSpecializedJobStep: { DuplicateSpecializedJobStepIdError },
  UpdateSpecializedJobStep: { SpecializedJobStepNotFoundError },
};
