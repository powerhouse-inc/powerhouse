import type { Operation } from "document-model";
import { type ErrorStatus } from "./types.js";

export class DocumentModelNotFoundError extends Error {
  constructor(
    public id: string,
    cause?: unknown,
  ) {
    super(`Document model "${id}" not found`, { cause });
  }
}
export class OperationError extends Error {
  status: ErrorStatus;
  operation: Operation | undefined;

  constructor(
    status: ErrorStatus,
    operation?: Operation,
    message?: string,
    cause?: unknown,
  ) {
    super(message, { cause: cause ?? operation });
    this.status = status;
    this.operation = operation;
  }
}

export class ConflictOperationError extends OperationError {
  constructor(existingOperation: Operation, newOperation: Operation) {
    super(
      "CONFLICT",
      newOperation,
      `Conflicting operation on index ${newOperation.index}`,
      { existingOperation, newOperation },
    );
  }
}

export class MissingOperationError extends OperationError {
  constructor(index: number, operation: Operation) {
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

export class DocumentNotFoundError extends Error {
  documentId: string;

  constructor(documentId: string) {
    super(`Document with id ${documentId} not found`);
    this.documentId = documentId;
  }
}

export class SynchronizationUnitNotFoundError extends Error {
  syncUnitId: string;

  constructor(message: string, syncUnitId: string) {
    super(message);
    this.syncUnitId = syncUnitId;
  }
}
