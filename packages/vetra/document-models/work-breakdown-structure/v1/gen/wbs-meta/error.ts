export type ErrorCode = "FeatureNotSetError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class FeatureNotSetError extends Error implements ReducerError {
  errorCode = "FeatureNotSetError" as ErrorCode;
  constructor(message = "FeatureNotSetError") {
    super(message);
  }
}

export const errors = {
  UpdateFeatureSnippet: { FeatureNotSetError },
};
