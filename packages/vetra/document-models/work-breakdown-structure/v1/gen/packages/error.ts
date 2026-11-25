export type ErrorCode =
  | "DuplicatePackageIdError"
  | "PackageNotFoundError"
  | "PackageNestingTooDeepError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicatePackageIdError extends Error implements ReducerError {
  errorCode = "DuplicatePackageIdError" as ErrorCode;
  constructor(message = "DuplicatePackageIdError") {
    super(message);
  }
}

export class PackageNotFoundError extends Error implements ReducerError {
  errorCode = "PackageNotFoundError" as ErrorCode;
  constructor(message = "PackageNotFoundError") {
    super(message);
  }
}

export class PackageNestingTooDeepError extends Error implements ReducerError {
  errorCode = "PackageNestingTooDeepError" as ErrorCode;
  constructor(message = "PackageNestingTooDeepError") {
    super(message);
  }
}

export const errors = {
  AddPackage: { DuplicatePackageIdError },
  UpdatePackage: { PackageNotFoundError },
  MovePackage: { PackageNestingTooDeepError },
};
