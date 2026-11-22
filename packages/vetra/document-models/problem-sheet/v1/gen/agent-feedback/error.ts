export type ErrorCode =
  | "DuplicateSuggestionIdError"
  | "SuggestionNotFoundError"
  | "SuggestionAlreadyResolvedError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateSuggestionIdError extends Error implements ReducerError {
  errorCode = "DuplicateSuggestionIdError" as ErrorCode;
  constructor(message = "DuplicateSuggestionIdError") {
    super(message);
  }
}

export class SuggestionNotFoundError extends Error implements ReducerError {
  errorCode = "SuggestionNotFoundError" as ErrorCode;
  constructor(message = "SuggestionNotFoundError") {
    super(message);
  }
}

export class SuggestionAlreadyResolvedError
  extends Error
  implements ReducerError
{
  errorCode = "SuggestionAlreadyResolvedError" as ErrorCode;
  constructor(message = "SuggestionAlreadyResolvedError") {
    super(message);
  }
}

export const errors = {
  AddSuggestion: { DuplicateSuggestionIdError },
  ResolveSuggestion: {
    SuggestionNotFoundError,
    SuggestionAlreadyResolvedError,
  },
};
