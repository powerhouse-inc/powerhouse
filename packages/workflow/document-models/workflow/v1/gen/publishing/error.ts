export type ErrorCode = "NothingPublishedError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class NothingPublishedError extends Error implements ReducerError {
  errorCode = "NothingPublishedError" as ErrorCode;
  constructor(message = "NothingPublishedError") {
    super(message);
  }
}

export const errors = {
  RevertToPublished: { NothingPublishedError },
};
