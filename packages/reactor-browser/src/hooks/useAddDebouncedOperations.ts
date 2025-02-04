import { useMemo, useCallback } from "react";
import { Document, Operation } from "document-model/document";

import { useUserPermissions } from "./useUserPermissions";
import { useDocumentDrives } from "./useDocumentDrives";
import { IDocumentDriveServer } from "document-drive";

function debounceOperations(
  callback: (operations: Operation[]) => Promise<Document | undefined>,
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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const oldOperation = operations[index]!;
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
    return new Promise<Document | undefined>((resolve, reject) => {
      timer = setTimeout(() => {
        callback(operations).then(resolve).catch(reject);
      }, timeout) as unknown as number;
    });
  };
}

export type UseAddDebouncedOperationsProps = {
  driveId: string;
  documentId: string;
};

export function useAddDebouncedOperations(
  reactor: IDocumentDriveServer | undefined,
  props: UseAddDebouncedOperationsProps,
) {
  const { driveId, documentId } = props;
  const [documentDrives] = useDocumentDrives(reactor);

  const { isAllowedToEditDocuments } = useUserPermissions() || {
    isAllowedToCreateDocuments: false,
    isAllowedToEditDocuments: false,
  };

  const addOperations = useCallback(
    async (driveId: string, id: string, operations: Operation[]) => {
      if (!isAllowedToEditDocuments) {
        throw new Error("User is not allowed to edit documents");
      }

      if (!reactor) {
        throw new Error("Reactor is not loaded");
      }

      const drive = documentDrives.find(
        (drive) => drive.state.global.id === driveId,
      );
      if (!drive) {
        throw new Error(`Drive with id ${driveId} not found`);
      }

      const newDocument = await reactor.queueOperations(
        driveId,
        id,
        operations,
      );
      return newDocument.document;
    },
    [documentDrives, isAllowedToEditDocuments, reactor],
  );

  const addDebouncedOperations = useMemo(() => {
    return debounceOperations((operations) =>
      addOperations(driveId, documentId, operations),
    );
  }, [addOperations, driveId, documentId]);

  return addDebouncedOperations;
}
