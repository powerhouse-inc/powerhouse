import type { Operation } from "document-model";
import { ErrorStatus } from "./types.js";

export class DocumentModelNotFoundError extends Error {
  constructor(
    public id: string,
    cause?: unknown,
  ) {
    super(`Document model "${id}" not found`, { cause });
  }
}
export class OperationError<TGlobalState, TLocalState> extends Error {
  status: ErrorStatus;
  operation: Operation<TGlobalState, TLocalState> | undefined;

  constructor(
    status: ErrorStatus,
    operation?: Operation<TGlobalState, TLocalState>,
    message?: string,
    cause?: unknown,
  ) {
    super(message, { cause: cause ?? operation });
    this.status = status;
    this.operation = operation;
  }
}

export class ConflictOperationError<
  TGlobalState,
  TLocalState,
> extends OperationError<TGlobalState, TLocalState> {
  constructor(
    existingOperation: Operation<TGlobalState, TLocalState>,
    newOperation: Operation<TGlobalState, TLocalState>,
  ) {
    super(
      "CONFLICT",
      newOperation,
      `Conflicting operation on index ${newOperation.index}`,
      { existingOperation, newOperation },
    );
  }
}

export class MissingOperationError<
  TGlobalState,
  TLocalState,
> extends OperationError<TGlobalState, TLocalState> {
  constructor(index: number, operation: Operation<TGlobalState, TLocalState>) {
    super("MISSING", operation, `Missing operation on index ${index}`);
  }
}

export class DriveAlreadyExistsError extends Error {
  driveId: string;

  constructor(driveId: string) {
    super(`Drive already exists. ID: ${driveId}`);
    this.driveId = driveId;
  }
}

export class DriveNotFoundError extends Error {
  driveId: string;

  constructor(driveId: string) {
    super(`Drive with id ${driveId} not found`);
    this.driveId = driveId;
  }
}

export class SynchronizationUnitNotFoundError extends Error {
  syncUnitId: string;

  constructor(message: string, syncUnitId: string) {
    super(message);
    this.syncUnitId = syncUnitId;
  }
}
