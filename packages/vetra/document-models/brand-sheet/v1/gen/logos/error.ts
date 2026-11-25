export type ErrorCode = "DuplicateLogoIdError" | "LogoNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateLogoIdError extends Error implements ReducerError {
  errorCode = "DuplicateLogoIdError" as ErrorCode;
  constructor(message = "DuplicateLogoIdError") {
    super(message);
  }
}

export class LogoNotFoundError extends Error implements ReducerError {
  errorCode = "LogoNotFoundError" as ErrorCode;
  constructor(message = "LogoNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddLogo: { DuplicateLogoIdError },
  UpdateLogo: { LogoNotFoundError },
};
