export type ErrorCode =
  | "InvalidReactorConfigError"
  | "ReactorSecretRefError"
  | "SecretRefNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidReactorConfigError extends Error implements ReducerError {
  errorCode = "InvalidReactorConfigError" as ErrorCode;
  constructor(message = "InvalidReactorConfigError") {
    super(message);
  }
}

export class ReactorSecretRefError extends Error implements ReducerError {
  errorCode = "ReactorSecretRefError" as ErrorCode;
  constructor(message = "ReactorSecretRefError") {
    super(message);
  }
}

export class SecretRefNotFoundError extends Error implements ReducerError {
  errorCode = "SecretRefNotFoundError" as ErrorCode;
  constructor(message = "SecretRefNotFoundError") {
    super(message);
  }
}

export const errors = {
  SetConfig: { InvalidReactorConfigError },

  SetSecretRef: { ReactorSecretRefError },

  RemoveSecretRef: { SecretRefNotFoundError },
};
