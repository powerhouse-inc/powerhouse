import {
  DocumentOperations,
  Operation,
  OperationScope,
  PHDocument,
  generateId,
} from "document-model";
import { driveDocumentType } from "../drive-document-model/constants.js";
import { DocumentDriveDocument } from "../drive-document-model/gen/types.js";
import { OperationError } from "../server/error.js";
import { RunAsap } from "./run-asap.js";

export const runAsap = RunAsap.runAsap;
export const runAsapAsync = RunAsap.runAsapAsync;

export function isDocumentDrive(
  document: PHDocument,
): document is DocumentDriveDocument {
  return document.documentType === driveDocumentType;
}

export function mergeOperations<TGlobalState, TLocalState>(
  currentOperations: DocumentOperations,
  newOperations: Operation[],
): DocumentOperations {
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
    .reduce<DocumentOperations>((acc, curr) => {
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
