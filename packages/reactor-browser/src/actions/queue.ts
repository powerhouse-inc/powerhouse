import { logger } from "document-drive";
import { type Action, type Operation, type PHDocument } from "document-model";

export async function queueActions(
  document: PHDocument | undefined,
  actionOrActions: Action[] | Action | undefined,
) {
  if (!actionOrActions) {
    logger.error("No actions found");
    return;
  }
  const actions = Array.isArray(actionOrActions)
    ? actionOrActions
    : [actionOrActions];

  if (actions.length === 0) {
    logger.error("No actions found");
    return;
  }
  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  if (!document) {
    logger.error("No document found");
    return;
  }

  const result = await reactor.queueActions(document.header.id, actions);
  if (result.status !== "SUCCESS") {
    logger.error(result.error);
  }
  return result.document;
}

export async function queueOperations(
  document: PHDocument | undefined,
  operationOrOperations: Operation[] | Operation | undefined,
) {
  if (!operationOrOperations) {
    logger.error("No operations found");
    return;
  }
  const operations = Array.isArray(operationOrOperations)
    ? operationOrOperations
    : [operationOrOperations];

  const reactor = window.reactor;
  if (!reactor) {
    return;
  }
  if (!document) {
    logger.error("No document found");
    return;
  }
  const deduplicatedOperations = deduplicateOperations(
    document.operations,
    operations,
  );
  const result = await reactor.queueOperations(
    document.header.id,
    deduplicatedOperations,
  );
  if (result.status !== "SUCCESS") {
    logger.error(result.error);
  }
  return result.document;
}

export function deduplicateOperations(
  existingOperations: Record<string, Operation[]>,
  operationsToDeduplicate: Operation[],
) {
  // make a set of all the operation indices for each scope to avoid duplicates
  const operationIndicesByScope = {} as Record<string, Set<number>>;
  for (const scope of Object.keys(existingOperations)) {
    operationIndicesByScope[scope] = new Set(
      existingOperations[scope].map((op) => op.index),
    );
  }

  const newOperations: Operation[] = [];

  for (const operation of operationsToDeduplicate) {
    const scope = operation.action.scope;
    const index = operation.index;
    if (operationIndicesByScope[scope].has(index)) {
      const duplicatedExistingOperation = existingOperations[scope].find(
        (op) => op.index === index,
      );
      const duplicatedNewOperation = newOperations.find(
        (op) => op.index === index,
      );
      console.warn("skipping duplicate operation");
      if (duplicatedExistingOperation) {
        console.warn(
          "duplicate existing operation",
          duplicatedExistingOperation,
        );
      }
      if (duplicatedNewOperation) {
        console.warn("duplicate new operation", duplicatedNewOperation);
      }
      continue;
    }
    newOperations.push(operation);
    operationIndicesByScope[scope].add(index);
  }

  const uniqueOperationIds = new Set<string>();
  const operationsDedupedById: Operation[] = [];

  for (const [scope, operations] of Object.entries(existingOperations)) {
    for (const operation of operations) {
      const id = operation.id;
      if (!id) {
        console.warn("skipping operation with no id", operation);
        continue;
      }
      if (uniqueOperationIds.has(id)) {
        console.warn(
          "skipping existing operation with duplicate id in scope",
          scope,
          operation,
        );
        continue;
      }
      uniqueOperationIds.add(id);
    }
  }

  for (const operation of newOperations) {
    const id = operation.id;
    if (!id) {
      console.warn("skipping operation with no id", operation);
      continue;
    }
    if (uniqueOperationIds.has(id)) {
      console.warn(
        "skipping new operation with duplicate id in scope",
        operation.action.scope,
        operation,
      );
      continue;
    }
    uniqueOperationIds.add(id);
    operationsDedupedById.push(operation);
  }
  return operationsDedupedById;
}

export async function uploadOperations(
  document: PHDocument | undefined,
  pushOperations: (
    document: PHDocument,
    operations: Operation[],
  ) => Promise<PHDocument | undefined>,
  options?: { waitForSync?: boolean; operationsLimit?: number },
) {
  if (!document) {
    logger.error("No document found");
    return;
  }
  const operationsLimit = options?.operationsLimit || 50;

  logger.verbose(
    `uploadDocumentOperations(documentId:${document.header.id}, ops: ${Object.keys(document.operations).join(",")}, limit:${operationsLimit})`,
  );

  for (const operations of Object.values(document.operations)) {
    for (let i = 0; i < operations.length; i += operationsLimit) {
      logger.verbose(
        `uploadDocumentOperations:for(i:${i}, ops:${operations.length}, limit:${operationsLimit}): START`,
      );
      const chunk = operations.slice(i, i + operationsLimit);
      const operation = chunk.at(-1);
      if (!operation) {
        break;
      }
      const scope = operation.action.scope;

      /*
          TODO: check why the waitForUpdate promise does not resolve after the first iteration
          if (options?.waitForSync) {
              void pushOperations(drive, documentId, chunk);
              await waitForUpdate(
                  10000,
                  documentId,
                  scope,
                  operation.index,
                  reactor,
              );
          } else {
              await pushOperations(drive, documentId, chunk);
          }
          */

      await pushOperations(document, chunk);

      logger.verbose(
        `uploadDocumentOperations:for:waitForUpdate(${document.header.id}:${scope} rev ${operation.index}): NEXT`,
      );
    }
  }

  logger.verbose(
    `uploadDocumentOperations:for:waitForUpdate(${document.header.id}): END`,
  );
}
