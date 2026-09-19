export type ErrorCode =
  | "DuplicateExpense"
  | "ExpenseNotFound"
  | "AlreadyApproved";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateExpense extends Error implements ReducerError {
  errorCode = "DuplicateExpense" as ErrorCode;
  constructor(message = "DuplicateExpense") {
    super(message);
  }
}

export class ExpenseNotFound extends Error implements ReducerError {
  errorCode = "ExpenseNotFound" as ErrorCode;
  constructor(message = "ExpenseNotFound") {
    super(message);
  }
}

export class AlreadyApproved extends Error implements ReducerError {
  errorCode = "AlreadyApproved" as ErrorCode;
  constructor(message = "AlreadyApproved") {
    super(message);
  }
}

export const errors = {
  SubmitExpense: { DuplicateExpense },

  ApproveExpense: { ExpenseNotFound, AlreadyApproved },
};
