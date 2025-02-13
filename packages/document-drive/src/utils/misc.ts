import {
  type DocumentDriveDocument,
  driveDocumentType,
} from "@drive-document-model";
import { OperationError } from "@server/error";
import {
  BaseDocument,
  DocumentOperations,
  Operation,
  OperationScope,
  generateId,
} from "document-model";
import { RunAsap } from "./run-asap.js";

export const runAsap = RunAsap.runAsap;
export const runAsapAsync = RunAsap.runAsapAsync;

export function isDocumentDrive(
  document: BaseDocument<any, any>,
): document is DocumentDriveDocument {
  return document.documentType === driveDocumentType;
}

export function mergeOperations<TGlobalState, TLocalState>(
  currentOperations: DocumentOperations<TGlobalState, TLocalState>,
  newOperations: Operation<TGlobalState, TLocalState>[],
): DocumentOperations<TGlobalState, TLocalState> {
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
    .reduce<DocumentOperations<TGlobalState, TLocalState>>((acc, curr) => {
      const existingOperations = acc[curr.scope] || [];
      return { ...acc, [curr.scope]: [...existingOperations, curr] };
    }, currentOperations);
}

export function generateUUID(): string {
  return generateId();
}

export function isNoopUpdate<TGlobalState, TLocalState>(
  operation: Operation<TGlobalState, TLocalState>,
  latestOperation?: Operation<TGlobalState, TLocalState>,
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
