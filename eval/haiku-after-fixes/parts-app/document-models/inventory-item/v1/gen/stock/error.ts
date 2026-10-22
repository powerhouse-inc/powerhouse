export type ErrorCode =
  | "ItemAlreadyAddedError"
  | "EmptyNameError"
  | "InvalidQuantityError"
  | "EmptyLocationError"
  | "ItemNotAddedError"
  | "ZeroAdjustmentError"
  | "InsufficientStockError"
  | "MoveBeforeAddError"
  | "EmptyMoveLocationError"
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

export class EmptyNameError extends Error implements ReducerError {
  errorCode = "EmptyNameError" as ErrorCode;
  constructor(message = "EmptyNameError") {
    super(message);
  }
}

export class InvalidQuantityError extends Error implements ReducerError {
  errorCode = "InvalidQuantityError" as ErrorCode;
  constructor(message = "InvalidQuantityError") {
    super(message);
  }
}

export class EmptyLocationError extends Error implements ReducerError {
  errorCode = "EmptyLocationError" as ErrorCode;
  constructor(message = "EmptyLocationError") {
    super(message);
  }
}

export class ItemNotAddedError extends Error implements ReducerError {
  errorCode = "ItemNotAddedError" as ErrorCode;
  constructor(message = "ItemNotAddedError") {
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

export class EmptyMoveLocationError extends Error implements ReducerError {
  errorCode = "EmptyMoveLocationError" as ErrorCode;
  constructor(message = "EmptyMoveLocationError") {
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
    EmptyNameError,
    InvalidQuantityError,
    EmptyLocationError,
  },

  AdjustQuantity: {
    ItemNotAddedError,
    ZeroAdjustmentError,
    InsufficientStockError,
  },

  MoveItem: { MoveBeforeAddError, EmptyMoveLocationError, SameLocationError },
};
