import {
  DocumentDriveDocument,
  documentModel as DocumentDriveModel,
} from "document-model-libs/document-drive";
import {
  Action,
  BaseAction,
  Document,
  DocumentOperations,
  Operation,
  OperationScope,
} from "document-model/document";
import { generateId } from "document-model/utils";
import { OperationError } from "../server/error";
import { DocumentDriveStorage, DocumentStorage } from "../storage";
import { RunAsap } from "./run-asap";
export * from "./run-asap";

export const runAsap = RunAsap.runAsap;
export const runAsapAsync = RunAsap.runAsapAsync;

export function isDocumentDriveStorage(
  document: DocumentStorage,
): document is DocumentDriveStorage {
  return document.documentType === DocumentDriveModel.id;
}

export function isDocumentDrive(
  document: Document,
): document is DocumentDriveDocument {
  return document.documentType === DocumentDriveModel.id;
}

export function mergeOperations<A extends Action = Action>(
  currentOperations: DocumentOperations<A>,
  newOperations: Operation<A | BaseAction>[],
): DocumentOperations<A> {
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
    .reduce<DocumentOperations<A>>((acc, curr) => {
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
