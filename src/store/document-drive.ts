import { decodeID, getRootPath } from '@powerhousedao/design-system';
import { Document, Operation } from 'document-model/document';
import { atom, useAtom } from 'jotai';
import { useEffect, useMemo, useState } from 'react';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

export const selectedPathAtom = atom<string | null>(null);
export const useSelectedPath = () => {
    const { documentDrives } = useDocumentDriveServer();
    const [selectedPath, setSelectedPath] = useAtom(selectedPathAtom);

    useEffect(() => {
        if (!selectedPath) {
            return;
        }
        const driveId = decodeID(getRootPath(selectedPath));
        const pathComponents = selectedPath.split('/');
        const nodeId =
            pathComponents.length > 1
                ? decodeID(pathComponents[pathComponents.length - 1])
                : undefined;

        const drive = documentDrives.find(
            drive => drive.state.global.id === driveId,
        );
        const file = drive?.state.global.nodes.find(node => node.id === nodeId);
        // if drive was deleted then removes selected path
        if (!drive) {
            setSelectedPath(null);
        }
        // if file was deleted then selects parent folder
        else if (nodeId && !file) {
            setSelectedPath(pathComponents.slice(0, -1).join('/'));
        }
    }, [documentDrives, selectedPath]);

    return [selectedPath, setSelectedPath] as const;
};

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
        operations.push(operation);
        return new Promise<Document | undefined>((resolve, reject) => {
            timer = setTimeout(() => {
                callback(operations).then(resolve).catch(reject);
            }, timeout) as unknown as number;
        });
    };
}

export const useFileNodeDocument = (drive?: string, id?: string) => {
    const {
        openFile,
        addOperation: _addOperation,
        addOperations,
        onStrandUpdate,
    } = useDocumentDriveServer();
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
