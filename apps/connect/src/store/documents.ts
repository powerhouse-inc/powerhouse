import { useDocumentDriveServer } from '#hooks';
import {
    useUnwrappedSelectedDocument,
    useUnwrappedSelectedDrive,
} from '@powerhousedao/common';

import { type Operation, type PHDocument } from 'document-model';
import { useCallback } from 'react';

export function useAddOperationToSelectedDocument() {
    const selectedDrive = useUnwrappedSelectedDrive();
    const selectedDocument = useUnwrappedSelectedDocument();
    const { addOperations } = useDocumentDriveServer();
    const addOperationsToSelectedDocument = useCallback(
        (operations: Operation) => {
            if (!selectedDrive?.id || !selectedDocument?.id) {
                return;
            }
            const debouncedAddOperations = debounceOperations(operations =>
                addOperations(
                    selectedDrive.id,
                    selectedDocument.id,
                    operations,
                ),
            );
            const result = debouncedAddOperations(operations);
            return result;
        },
        [addOperations, selectedDrive?.id, selectedDocument?.id],
    );
    return addOperationsToSelectedDocument;
}

export function useAddOperationsToSelectedDrive() {
    const selectedDrive = useUnwrappedSelectedDrive();
    const { addOperations } = useDocumentDriveServer();
    const addOperationsToSelectedDrive = useCallback(
        (operations: Operation) => {
            if (!selectedDrive?.id) {
                return;
            }
            const debouncedAddOperations = debounceOperations(operations =>
                addOperations(selectedDrive.id, undefined, operations),
            );
            const result = debouncedAddOperations(operations);
            return result;
        },
        [addOperations, selectedDrive?.id],
    );
    return addOperationsToSelectedDrive;
}

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
            op => op.scope === operation.scope && op.index === operation.index,
        );
        if (index > -1) {
            const oldOperation = operations[index];
            if (
                !(
                    oldOperation.type === operation.type &&
                    JSON.stringify(operation.input) ===
                        JSON.stringify(oldOperation.input)
                )
            ) {
                console.warn(
                    'Two conflicting operations were dispatched:',
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
