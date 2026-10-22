export type ErrorCode =
  | "InvalidQuantityError"
  | "InsufficientStockError"
  | "EmptyLocationError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidQuantityError extends Error implements ReducerError {
  errorCode = "InvalidQuantityError" as ErrorCode;
  constructor(message = "InvalidQuantityError") {
    super(message);
  }
}

export class InsufficientStockError extends Error implements ReducerError {
  errorCode = "InsufficientStockError" as ErrorCode;
  constructor(message = "InsufficientStockError") {
    super(message);
  }
}

export class EmptyLocationError extends Error implements ReducerError {
  errorCode = "EmptyLocationError" as ErrorCode;
  constructor(message = "EmptyLocationError") {
    super(message);
  }
}

export const errors = {
  AddItem: { InvalidQuantityError },

  AdjustQuantity: { InsufficientStockError },

  MoveItem: { EmptyLocationError },
};
