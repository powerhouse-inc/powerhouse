export type ErrorCode = "InvalidValue" | "EmptyValue";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidValue extends Error implements ReducerError {
  errorCode = "InvalidValue" as ErrorCode;
  constructor(message = "InvalidValue") {
    super(message);
  }
}

export class EmptyValue extends Error implements ReducerError {
  errorCode = "EmptyValue" as ErrorCode;
  constructor(message = "EmptyValue") {
    super(message);
  }
}

export const errors = {
  SetValue: { InvalidValue, EmptyValue },
};
