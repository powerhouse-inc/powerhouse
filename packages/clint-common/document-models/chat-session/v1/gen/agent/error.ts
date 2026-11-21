export type ErrorCode =
  | "InvalidContentPartError"
  | "MessageNotFoundError"
  | "NotAssistantMessageError"
  | "ContentPartNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidContentPartError extends Error implements ReducerError {
  errorCode = "InvalidContentPartError" as ErrorCode;
  constructor(message = "InvalidContentPartError") {
    super(message);
  }
}

export class MessageNotFoundError extends Error implements ReducerError {
  errorCode = "MessageNotFoundError" as ErrorCode;
  constructor(message = "MessageNotFoundError") {
    super(message);
  }
}

export class NotAssistantMessageError extends Error implements ReducerError {
  errorCode = "NotAssistantMessageError" as ErrorCode;
  constructor(message = "NotAssistantMessageError") {
    super(message);
  }
}

export class ContentPartNotFoundError extends Error implements ReducerError {
  errorCode = "ContentPartNotFoundError" as ErrorCode;
  constructor(message = "ContentPartNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddAssistantMessage: { InvalidContentPartError },

  AppendAssistantContent: {
    MessageNotFoundError,
    NotAssistantMessageError,
    InvalidContentPartError,
  },

  UpdateAssistantContent: { MessageNotFoundError, ContentPartNotFoundError },

  SetMessageUsage: { MessageNotFoundError },

  FinishAssistantMessage: { MessageNotFoundError },

  MarkMessagePickedUp: { MessageNotFoundError },
};
