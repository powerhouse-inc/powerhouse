export type ErrorCode = "InvalidStatusTransition" | "StatusAlreadySet";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidStatusTransition extends Error implements ReducerError {
  errorCode = "InvalidStatusTransition" as ErrorCode;
  constructor(message = "InvalidStatusTransition") {
    super(message);
  }
}

export class StatusAlreadySet extends Error implements ReducerError {
  errorCode = "StatusAlreadySet" as ErrorCode;
  constructor(message = "StatusAlreadySet") {
    super(message);
  }
}

export const errors = {
  EditStatus: { InvalidStatusTransition, StatusAlreadySet },
};
