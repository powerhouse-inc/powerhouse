export type ErrorCode = "SecretRefNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class SecretRefNotFoundError extends Error implements ReducerError {
  errorCode = "SecretRefNotFoundError" as ErrorCode;
  constructor(message = "SecretRefNotFoundError") {
    super(message);
  }
}

export const errors = {
  RemoveSecretRef: { SecretRefNotFoundError },
};
