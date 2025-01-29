export type ErrorCode =
  | "MessageContentCannotBeEmpty"
  | "MessageContentExceedsTheMaximumLength";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class MessageContentCannotBeEmpty extends Error implements ReducerError {
  errorCode = "MessageContentCannotBeEmpty" as ErrorCode;
  constructor(message = "MessageContentCannotBeEmpty") {
    super(message);
  }
}

export class MessageContentExceedsTheMaximumLength
  extends Error
  implements ReducerError
{
  errorCode = "MessageContentExceedsTheMaximumLength" as ErrorCode;
  constructor(message = "MessageContentExceedsTheMaximumLength") {
    super(message);
  }
}

export const errors = {
  AddMessage: {
    MessageContentCannotBeEmpty,
    MessageContentExceedsTheMaximumLength,
  },
};
