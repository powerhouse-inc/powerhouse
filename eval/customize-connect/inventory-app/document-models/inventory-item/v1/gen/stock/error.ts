export type ErrorCode =
  | "InvalidAmountError"
  | "NegativeQuantityError"
  | "SameLocationError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidAmountError extends Error implements ReducerError {
  errorCode = "InvalidAmountError" as ErrorCode;
  constructor(message = "InvalidAmountError") {
    super(message);
  }
}

export class NegativeQuantityError extends Error implements ReducerError {
  errorCode = "NegativeQuantityError" as ErrorCode;
  constructor(message = "NegativeQuantityError") {
    super(message);
  }
}

export class SameLocationError extends Error implements ReducerError {
  errorCode = "SameLocationError" as ErrorCode;
  constructor(message = "SameLocationError") {
    super(message);
  }
}

export const errors = {
  AddStock: { InvalidAmountError },

  AdjustQuantity: { NegativeQuantityError },

  MoveItem: { SameLocationError },
};
