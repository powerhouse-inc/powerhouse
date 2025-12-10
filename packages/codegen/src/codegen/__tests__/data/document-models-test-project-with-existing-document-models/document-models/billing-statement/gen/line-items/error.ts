export type ErrorCode = "DuplicateLineItem" | "InvalidStatusTransition";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateLineItem extends Error implements ReducerError {
  errorCode = "DuplicateLineItem" as ErrorCode;
  constructor(message = "DuplicateLineItem") {
    super(message);
  }
}

export class InvalidStatusTransition extends Error implements ReducerError {
  errorCode = "InvalidStatusTransition" as ErrorCode;
  constructor(message = "InvalidStatusTransition") {
    super(message);
  }
}

export const errors = {
  AddLineItem: {
    DuplicateLineItem,
    InvalidStatusTransition,
  },
};
