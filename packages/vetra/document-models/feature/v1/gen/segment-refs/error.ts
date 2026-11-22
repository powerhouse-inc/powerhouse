export type ErrorCode =
  | "DuplicateSegmentRefIdError"
  | "SegmentRefNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateSegmentRefIdError extends Error implements ReducerError {
  errorCode = "DuplicateSegmentRefIdError" as ErrorCode;
  constructor(message = "DuplicateSegmentRefIdError") {
    super(message);
  }
}

export class SegmentRefNotFoundError extends Error implements ReducerError {
  errorCode = "SegmentRefNotFoundError" as ErrorCode;
  constructor(message = "SegmentRefNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddSegmentRef: { DuplicateSegmentRefIdError },
  UpdateSegmentRefSnippet: { SegmentRefNotFoundError },
};
