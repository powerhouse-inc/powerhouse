export type ErrorCode = "DuplicateTypefaceIdError" | "TypefaceNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateTypefaceIdError extends Error implements ReducerError {
  errorCode = "DuplicateTypefaceIdError" as ErrorCode;
  constructor(message = "DuplicateTypefaceIdError") {
    super(message);
  }
}

export class TypefaceNotFoundError extends Error implements ReducerError {
  errorCode = "TypefaceNotFoundError" as ErrorCode;
  constructor(message = "TypefaceNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddTypeface: { DuplicateTypefaceIdError },
  UpdateTypeface: { TypefaceNotFoundError },
};
