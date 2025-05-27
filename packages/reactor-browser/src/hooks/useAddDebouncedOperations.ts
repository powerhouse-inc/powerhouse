import { type Operation, type PHDocument } from "document-model";
import { useCallback, useMemo } from "react";

import { type IDocumentDriveServer } from "document-drive";
import { useUserPermissions } from "./useUserPermissions.js";

function debounceOperations(
  callback: (operations: Operation[]) => Promise<PHDocument | undefined>,
  timeout = 50,
) {
  let timer: number;
  const operations: Operation[] = [];
  return (operation: Operation) => {
    if (timer) {
      clearTimeout(timer);
    }
    const index = operations.findIndex(
      (op) => op.scope === operation.scope && op.index === operation.index,
    );
    if (index > -1) {
      const oldOperation = operations[index];
      if (
        !(
          oldOperation.type === operation.type &&
          JSON.stringify(operation.input) === JSON.stringify(oldOperation.input)
        )
      ) {
        console.warn(
          "Two conflicting operations were dispatched:",
          oldOperation,
          operation,
        );
      }
      operations[index] = operation;
    } else {
      operations.push(operation);
    }
    return new Promise<PHDocument | undefined>((resolve, reject) => {
      timer = setTimeout(() => {
        callback(operations).then(resolve).catch(reject);
      }, timeout) as unknown as number;
    });
  };
}

export type UseAddDebouncedOperationsProps = {
  documentId: string;
};

export function useAddDebouncedOperations(
  reactor: IDocumentDriveServer | undefined,
  props: UseAddDebouncedOperationsProps,
) {
  const { documentId } = props;

  const { isAllowedToEditDocuments } = useUserPermissions() || {
    isAllowedToCreateDocuments: false,
    isAllowedToEditDocuments: false,
  };

  const addOperations = useCallback(
    async (id: string, operations: Operation[]) => {
      if (!isAllowedToEditDocuments) {
        throw new Error("User is not allowed to edit documents");
      }

      if (!reactor) {
        throw new Error("Reactor is not loaded");
      }

      const newDocument = await reactor.queueOperations(id, operations);
      return newDocument.document;
    },
    [isAllowedToEditDocuments, reactor],
  );

  const addDebouncedOperations = useMemo(() => {
    return debounceOperations((operations) =>
      addOperations(documentId, operations),
    );
  }, [addOperations, documentId]);

  return addDebouncedOperations;
}
