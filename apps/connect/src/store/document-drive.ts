import { FILE, TUiNodesContext } from '@powerhousedao/design-system';
import { Document, Operation } from 'document-model/document';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

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
        return new Promise<Document | undefined>((resolve, reject) => {
            timer = setTimeout(() => {
                callback(operations).then(resolve).catch(reject);
            }, timeout) as unknown as number;
        });
    };
}

export function useFileNodeDocument(
    props: TUiNodesContext & TDocumentDriveServer,
) {
    const { selectedNode, openFile, addOperations, onStrandUpdate } = props;
    const [selectedDocument, setSelectedDocument] = useState<
        Document | undefined
    >();

    const fetchDocument = useCallback(async () => {
        if (selectedNode?.kind !== FILE) {
            return;
        }
        try {
            const document = await openFile(
                selectedNode.driveId,
                selectedNode.id,
            );
            setSelectedDocument(document);
        } catch (error) {
            setSelectedDocument(undefined);
            console.error(error);
        }
    }, [openFile, selectedNode?.driveId, selectedNode?.id, selectedNode?.kind]);

    useEffect(() => {
        let handler: (() => void) | undefined = undefined;
        if (selectedNode?.kind === FILE) {
            handler = onStrandUpdate(strand => {
                if (
                    strand.driveId === selectedNode.driveId &&
                    strand.documentId === selectedNode.id
                ) {
                    fetchDocument().catch(console.error);
                }
            });
            fetchDocument().catch(console.error);
        } else {
            setSelectedDocument(undefined);
        }

        return () => {
            handler?.();
        };
    }, [fetchDocument, onStrandUpdate, selectedNode]);

    const addOperationToSelectedDocument = useMemo(() => {
        if (selectedNode?.kind === FILE) {
            return debounceOperations(operations =>
                addOperations(
                    selectedNode.driveId,
                    selectedNode.id,
                    operations,
                ),
            );
        }
    }, [
        addOperations,
        selectedNode?.driveId,
        selectedNode?.id,
        selectedNode?.kind,
    ]);

    return useMemo(
        () => ({
            selectedDocument,
            setSelectedDocument,
            addOperationToSelectedDocument,
        }),
        [selectedDocument, setSelectedDocument, addOperationToSelectedDocument],
    );
}
