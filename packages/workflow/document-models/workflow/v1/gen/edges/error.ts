export type ErrorCode =
  | "DuplicateEdgeIdError"
  | "EdgeSourceNotFoundError"
  | "EdgeTargetNotFoundError"
  | "EdgeNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateEdgeIdError extends Error implements ReducerError {
  errorCode = "DuplicateEdgeIdError" as ErrorCode;
  constructor(message = "DuplicateEdgeIdError") {
    super(message);
  }
}

export class EdgeSourceNotFoundError extends Error implements ReducerError {
  errorCode = "EdgeSourceNotFoundError" as ErrorCode;
  constructor(message = "EdgeSourceNotFoundError") {
    super(message);
  }
}

export class EdgeTargetNotFoundError extends Error implements ReducerError {
  errorCode = "EdgeTargetNotFoundError" as ErrorCode;
  constructor(message = "EdgeTargetNotFoundError") {
    super(message);
  }
}

export class EdgeNotFoundError extends Error implements ReducerError {
  errorCode = "EdgeNotFoundError" as ErrorCode;
  constructor(message = "EdgeNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddEdge: {
    DuplicateEdgeIdError,
    EdgeSourceNotFoundError,
    EdgeTargetNotFoundError,
  },

  RemoveEdge: { EdgeNotFoundError },
};
