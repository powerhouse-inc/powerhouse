import type { ErrorStatus } from "@server/types";
import type { BaseAction, Operation } from "document-model";

export class DocumentModelNotFoundError extends Error {
  constructor(
    public id: string,
    cause?: unknown,
  ) {
    super(`Document model "${id}" not found`, { cause });
  }
}
export class OperationError<TGlobalState, TLocalState, TAction extends BaseAction> extends Error {
  status: ErrorStatus;
  operation: Operation<TGlobalState, TLocalState, TAction> | undefined;

  constructor(
    status: ErrorStatus,
    operation?: Operation<TGlobalState, TLocalState, TAction>,
    message?: string,
    cause?: unknown,
  ) {
    super(message, { cause: cause ?? operation });
    this.status = status;
    this.operation = operation;
  }
}

export class ConflictOperationError<TGlobalState, TLocalState, TAction extends BaseAction> extends OperationError<TGlobalState, TLocalState, TAction> {
  constructor(existingOperation: Operation<TGlobalState, TLocalState, TAction>, newOperation: Operation<TGlobalState, TLocalState, TAction>) {
    super(
      "CONFLICT",
      newOperation,
      `Conflicting operation on index ${newOperation.index}`,
      { existingOperation, newOperation },
    );
  }
}

export class MissingOperationError<TGlobalState, TLocalState, TAction extends BaseAction> extends OperationError<TGlobalState, TLocalState, TAction> {
  constructor(index: number, operation: Operation<TGlobalState, TLocalState, TAction>) {
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
