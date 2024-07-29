import { Document, Operation } from 'document-model/document';
import { useEffect, useMemo, useState } from 'react';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

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

export const useFileNodeDocument = (drive?: string, id?: string) => {
    const { openFile, addOperations, onStrandUpdate } =
        useDocumentDriveServer();
    const [selectedDocument, setSelectedDocument] = useState<
        Document | undefined
    >();

    async function fetchDocument(drive: string, id: string) {
        try {
            const document = await openFile(drive, id);
            setSelectedDocument(document);
        } catch (error) {
            setSelectedDocument(undefined);
            console.error(error);
        }
    }

    useEffect(() => {
        let handler: (() => void) | undefined = undefined;
        if (drive && id) {
            handler = onStrandUpdate(strand => {
                if (strand.driveId === drive && strand.documentId === id) {
                    fetchDocument(drive, id);
                }
            });
            fetchDocument(drive, id);
        } else {
            setSelectedDocument(undefined);
        }

        return () => {
            handler?.();
        };
    }, [drive, id]);

    useEffect(() => {}, [drive, id]);

    const addOperation = useMemo(() => {
        if (drive && id) {
            return debounceOperations(operations =>
                addOperations(drive, id, operations),
            );
        }
    }, [addOperations, drive, id]);

    return [selectedDocument, setSelectedDocument, addOperation] as const;
};
