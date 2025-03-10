import {
  DocumentOperations,
  type Operation,
  type OperationFromDocument,
  type OperationScope,
  type OperationsFromDocument,
  type PHDocument,
  generateId,
} from "document-model";

import { driveDocumentType } from "#drive-document-model/constants";
import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import { OperationError } from "#server/error";
import { RunAsap } from "./run-asap.js";

export const runAsap = RunAsap.runAsap;
export const runAsapAsync = RunAsap.runAsapAsync;

export function isDocumentDrive(
  document: PHDocument,
): document is DocumentDriveDocument {
  return document.documentType === driveDocumentType;
}

export function mergeOperations<TDocument extends PHDocument>(
  currentOperations: OperationsFromDocument<TDocument>,
  newOperations: OperationFromDocument<TDocument>[],
): OperationsFromDocument<TDocument> {
  const minIndexByScope = Object.keys(currentOperations).reduce<
    Partial<Record<OperationScope, number>>
  >((acc, curr) => {
    const scope = curr as OperationScope;
    acc[scope] = currentOperations[scope].at(-1)?.index ?? 0;
    return acc;
  }, {});

  const conflictOp = newOperations.find(
    (op) => op.index < (minIndexByScope[op.scope] ?? 0),
  );
  if (conflictOp) {
    throw new OperationError(
      "ERROR",
      conflictOp,
      `Tried to add operation with index ${conflictOp.index} and document is at index ${minIndexByScope[conflictOp.scope]}`,
    );
  }

  return newOperations
    .sort((a, b) => a.index - b.index)
    .reduce<OperationsFromDocument<TDocument>>((acc, curr) => {
      const existingOperations = acc[curr.scope] || [];
      return { ...acc, [curr.scope]: [...existingOperations, curr] };
    }, currentOperations);
}

export function generateUUID(): string {
  return generateId();
}

export function isNoopUpdate(
  operation: Operation,
  latestOperation?: Operation,
) {
  if (!latestOperation) {
    return false;
  }

  const isNoopOp = operation.type === "NOOP";
  const isNoopLatestOp = latestOperation.type === "NOOP";
  const isSameIndexOp = operation.index === latestOperation.index;
  const isSkipOpGreaterThanLatestOp = operation.skip > latestOperation.skip;

  return (
    isNoopOp && isNoopLatestOp && isSameIndexOp && isSkipOpGreaterThanLatestOp
  );
}

// return true if dateA is before dateB
export function isBefore(dateA: Date | string, dateB: Date | string) {
  return new Date(dateA) < new Date(dateB);
}
