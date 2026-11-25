export type ErrorCode =
  | "DuplicateImageReferenceIdError"
  | "ImageReferenceNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateImageReferenceIdError
  extends Error
  implements ReducerError
{
  errorCode = "DuplicateImageReferenceIdError" as ErrorCode;
  constructor(message = "DuplicateImageReferenceIdError") {
    super(message);
  }
}

export class ImageReferenceNotFoundError extends Error implements ReducerError {
  errorCode = "ImageReferenceNotFoundError" as ErrorCode;
  constructor(message = "ImageReferenceNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddImageryReference: { DuplicateImageReferenceIdError },
  RemoveImageryReference: { ImageReferenceNotFoundError },
};
