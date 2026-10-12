export type ErrorCode =
  | "InvalidTriggerBlockError"
  | "TriggerConfigNotObjectError"
  | "TriggerNotSetError"
  | "ConfigTriggerNotSetError"
  | "SetTriggerConfigNotObjectError"
  | "ConnectionTriggerNotSetError"
  | "VersionTriggerNotSetError"
  | "InvalidTriggerPieceVersionError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidTriggerBlockError extends Error implements ReducerError {
  errorCode = "InvalidTriggerBlockError" as ErrorCode;
  constructor(message = "InvalidTriggerBlockError") {
    super(message);
  }
}

export class TriggerConfigNotObjectError extends Error implements ReducerError {
  errorCode = "TriggerConfigNotObjectError" as ErrorCode;
  constructor(message = "TriggerConfigNotObjectError") {
    super(message);
  }
}

export class TriggerNotSetError extends Error implements ReducerError {
  errorCode = "TriggerNotSetError" as ErrorCode;
  constructor(message = "TriggerNotSetError") {
    super(message);
  }
}

export class ConfigTriggerNotSetError extends Error implements ReducerError {
  errorCode = "ConfigTriggerNotSetError" as ErrorCode;
  constructor(message = "ConfigTriggerNotSetError") {
    super(message);
  }
}

export class SetTriggerConfigNotObjectError
  extends Error
  implements ReducerError
{
  errorCode = "SetTriggerConfigNotObjectError" as ErrorCode;
  constructor(message = "SetTriggerConfigNotObjectError") {
    super(message);
  }
}

export class ConnectionTriggerNotSetError
  extends Error
  implements ReducerError
{
  errorCode = "ConnectionTriggerNotSetError" as ErrorCode;
  constructor(message = "ConnectionTriggerNotSetError") {
    super(message);
  }
}

export class VersionTriggerNotSetError extends Error implements ReducerError {
  errorCode = "VersionTriggerNotSetError" as ErrorCode;
  constructor(message = "VersionTriggerNotSetError") {
    super(message);
  }
}

export class InvalidTriggerPieceVersionError
  extends Error
  implements ReducerError
{
  errorCode = "InvalidTriggerPieceVersionError" as ErrorCode;
  constructor(message = "InvalidTriggerPieceVersionError") {
    super(message);
  }
}

export const errors = {
  SetTrigger: { InvalidTriggerBlockError, TriggerConfigNotObjectError },

  ClearTrigger: { TriggerNotSetError },

  SetTriggerConfig: {
    ConfigTriggerNotSetError,
    SetTriggerConfigNotObjectError,
  },

  SetTriggerConnection: { ConnectionTriggerNotSetError },

  SetTriggerPieceVersion: {
    VersionTriggerNotSetError,
    InvalidTriggerPieceVersionError,
  },
};
