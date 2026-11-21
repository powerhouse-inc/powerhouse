export type ErrorCode = "MessageNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class MessageNotFoundError extends Error implements ReducerError {
  errorCode = "MessageNotFoundError" as ErrorCode;
  constructor(message = "MessageNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddToolOutput: { MessageNotFoundError },
};
