import {
  type Operation,
  type OperationFromDocument,
  type OperationsFromDocument,
  type PHDocument,
} from "document-model";

import { driveDocumentType } from "#drive-document-model/constants";
import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import { OperationError } from "#server/error";
import { type ListenerRevision } from "#server/types";
import { pascalCase } from "change-case";
import { RunAsap } from "./run-asap.js";

export const runAsap = RunAsap.runAsap;
export const runAsapAsync = RunAsap.runAsapAsync;

export function isDocumentDrive(
  document: PHDocument,
): document is DocumentDriveDocument {
  return document.header.documentType === driveDocumentType;
}

export function mergeOperations<TDocument extends PHDocument>(
  currentOperations: OperationsFromDocument<TDocument>,
  newOperations: OperationFromDocument<TDocument>[],
): OperationsFromDocument<TDocument> {
  const minIndexByScope = Object.keys(currentOperations).reduce<
    Partial<Record<string, number>>
  >((acc, curr) => {
    const scope = curr;
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

export function operationsToRevision(
  operations: Pick<Operation, "index">[] | undefined,
): ListenerRevision["revision"] {
  const lastOperation = operations?.at(-1);
  return lastOperation ? lastOperation.index + 1 : 0;
}

/**
 * Converts a string to PascalCase
 * @param {string} str - The input string to convert
 * @returns {string} The string in PascalCase format
 *
 * Examples:
 * "hello world" -> "HelloWorld"
 * "hello-world" -> "HelloWorld"
 * "hello_world" -> "HelloWorld"
 * "helloWorld" -> "HelloWorld"
 */
export const toPascalCase = pascalCase;
