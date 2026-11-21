export type ErrorCode =
  | "InvalidContentPartError"
  | "MessageNotFoundError"
  | "NotUserMessageError"
  | "SessionNotResumableError";

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

export class NotUserMessageError extends Error implements ReducerError {
  errorCode = "NotUserMessageError" as ErrorCode;
  constructor(message = "NotUserMessageError") {
    super(message);
  }
}

export class SessionNotResumableError extends Error implements ReducerError {
  errorCode = "SessionNotResumableError" as ErrorCode;
  constructor(message = "SessionNotResumableError") {
    super(message);
  }
}

export const errors = {
  AddUserMessage: { InvalidContentPartError },

  DeleteUserMessage: { MessageNotFoundError, NotUserMessageError },

  RetryTurn: { MessageNotFoundError, NotUserMessageError },

  ResumeSession: { SessionNotResumableError },
};
