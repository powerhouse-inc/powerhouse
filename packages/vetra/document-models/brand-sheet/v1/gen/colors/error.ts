export type ErrorCode = "DuplicateColorIdError" | "ColorNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateColorIdError extends Error implements ReducerError {
  errorCode = "DuplicateColorIdError" as ErrorCode;
  constructor(message = "DuplicateColorIdError") {
    super(message);
  }
}

export class ColorNotFoundError extends Error implements ReducerError {
  errorCode = "ColorNotFoundError" as ErrorCode;
  constructor(message = "ColorNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddColor: { DuplicateColorIdError },
  UpdateColor: { ColorNotFoundError },
};
