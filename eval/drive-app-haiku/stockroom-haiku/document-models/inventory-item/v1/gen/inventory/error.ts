export type ErrorCode =
  | "ItemAlreadyAddedError"
  | "AdjustItemNotAddedError"
  | "NegativeQuantityError"
  | "MoveItemNotAddedError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class ItemAlreadyAddedError extends Error implements ReducerError {
  errorCode = "ItemAlreadyAddedError" as ErrorCode;
  constructor(message = "ItemAlreadyAddedError") {
    super(message);
  }
}

export class AdjustItemNotAddedError extends Error implements ReducerError {
  errorCode = "AdjustItemNotAddedError" as ErrorCode;
  constructor(message = "AdjustItemNotAddedError") {
    super(message);
  }
}

export class NegativeQuantityError extends Error implements ReducerError {
  errorCode = "NegativeQuantityError" as ErrorCode;
  constructor(message = "NegativeQuantityError") {
    super(message);
  }
}

export class MoveItemNotAddedError extends Error implements ReducerError {
  errorCode = "MoveItemNotAddedError" as ErrorCode;
  constructor(message = "MoveItemNotAddedError") {
    super(message);
  }
}

export const errors = {
  AddItem: { ItemAlreadyAddedError },

  AdjustQuantity: { AdjustItemNotAddedError, NegativeQuantityError },

  MoveItem: { MoveItemNotAddedError },
};
