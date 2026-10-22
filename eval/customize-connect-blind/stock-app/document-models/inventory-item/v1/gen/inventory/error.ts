export type ErrorCode =
  | "ItemAlreadyAddedError"
  | "EmptyItemNameError"
  | "NegativeStartingQuantityError"
  | "AdjustBeforeAddError"
  | "ZeroAdjustmentError"
  | "InsufficientStockError"
  | "MoveBeforeAddError"
  | "EmptyLocationError"
  | "SameLocationError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class ItemAlreadyAddedError extends Error implements ReducerError {
  errorCode = "ItemAlreadyAddedError" as ErrorCode;
  constructor(message = "ItemAlreadyAddedError") {
    super(message);
  }
}

export class EmptyItemNameError extends Error implements ReducerError {
  errorCode = "EmptyItemNameError" as ErrorCode;
  constructor(message = "EmptyItemNameError") {
    super(message);
  }
}

export class NegativeStartingQuantityError
  extends Error
  implements ReducerError
{
  errorCode = "NegativeStartingQuantityError" as ErrorCode;
  constructor(message = "NegativeStartingQuantityError") {
    super(message);
  }
}

export class AdjustBeforeAddError extends Error implements ReducerError {
  errorCode = "AdjustBeforeAddError" as ErrorCode;
  constructor(message = "AdjustBeforeAddError") {
    super(message);
  }
}

export class ZeroAdjustmentError extends Error implements ReducerError {
  errorCode = "ZeroAdjustmentError" as ErrorCode;
  constructor(message = "ZeroAdjustmentError") {
    super(message);
  }
}

export class InsufficientStockError extends Error implements ReducerError {
  errorCode = "InsufficientStockError" as ErrorCode;
  constructor(message = "InsufficientStockError") {
    super(message);
  }
}

export class MoveBeforeAddError extends Error implements ReducerError {
  errorCode = "MoveBeforeAddError" as ErrorCode;
  constructor(message = "MoveBeforeAddError") {
    super(message);
  }
}

export class EmptyLocationError extends Error implements ReducerError {
  errorCode = "EmptyLocationError" as ErrorCode;
  constructor(message = "EmptyLocationError") {
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
  AddItem: {
    ItemAlreadyAddedError,
    EmptyItemNameError,
    NegativeStartingQuantityError,
  },

  AdjustQuantity: {
    AdjustBeforeAddError,
    ZeroAdjustmentError,
    InsufficientStockError,
  },

  MoveItem: { MoveBeforeAddError, EmptyLocationError, SameLocationError },
};
