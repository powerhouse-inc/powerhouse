export type ErrorCode = "ReservedConnectorError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class ReservedConnectorError extends Error implements ReducerError {
  errorCode = "ReservedConnectorError" as ErrorCode;
  constructor(message = "ReservedConnectorError") {
    super(message);
  }
}

export const errors = {
  SetConnector: { ReservedConnectorError },
};
