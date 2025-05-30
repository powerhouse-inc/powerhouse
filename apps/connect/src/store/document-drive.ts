import { useReadModeContext } from '#context';
import {
    documentToHash,
    useDocumentDriveById,
    useDocumentDriveServer,
} from '#hooks';
import {
    getDriveSharingType,
    useSelectedDriveId,
    useSelectedNodeDocumentType,
    useSelectedNodeId,
    useSelectedNodeKind,
    useSelectedNodeName,
} from '@powerhousedao/reactor-browser/atoms';
import { logger } from 'document-drive';
import {
    hashDocumentStateForScope,
    type Operation,
    type PHDocument,
} from 'document-model';
import { atom, useAtom, useSetAtom } from 'jotai';
import { useCallback, useDebugValue, useEffect, useMemo } from 'react';

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

export type FileNodeDocument =
    | {
          driveId: string;
          documentId: string;
          documentType: string;
          name: string;
          document: PHDocument | undefined;
          status: 'LOADING' | 'ERROR';
      }
    | {
          driveId: string;
          documentId: string;
          documentType: string;
          name: string;
          document: PHDocument;
          status: 'LOADED';
      }
    | undefined;

const documentCacheAtom = atom(new Map<string, PHDocument>());

const singletonFileNodeDocumentAtom = atom<FileNodeDocument>(undefined);

export function isSameDocument(
    prev: PHDocument | undefined,
    next: PHDocument | undefined,
) {
    if (prev === next) {
        return true;
    }
    if (!prev || !next) {
        return false;
    }
    if (hashDocumentStateForScope(prev) === hashDocumentStateForScope(next)) {
        return true;
    } else {
        return false;
    }
}

const fileNodeDocumentAtom = atom(
    get => get(singletonFileNodeDocumentAtom),
    (get, set, newValue: FileNodeDocument) => {
        const currentValue = get(singletonFileNodeDocumentAtom);

        // if document will be loaded then sets
        // the cached version while it loads
        const documentCache = get(documentCacheAtom);
        if (!newValue?.document && newValue?.status === 'LOADING') {
            newValue.document = documentCache.get(
                `${newValue.driveId}:${newValue.documentId}`,
            );
        }

        // only change if the provided file node is different
        if (
            currentValue?.driveId !== newValue?.driveId ||
            currentValue?.documentId !== newValue?.documentId ||
            currentValue?.documentType !== newValue?.documentType ||
            currentValue?.status !== newValue?.status ||
            !!currentValue?.document !== !!newValue?.document ||
            (currentValue?.document &&
                newValue?.document &&
                documentToHash(currentValue.document) !==
                    documentToHash(newValue.document))
        ) {
            // if document has been fetched then updates the cache
            if (newValue?.status === 'LOADED') {
                documentCache.set(
                    `${newValue.driveId}:${newValue.documentId}`,
                    newValue.document,
                );
            }

            set(singletonFileNodeDocumentAtom, newValue);
            return true;
        }

        return false;
    },
);

const selectedDocumentAtom = atom(
    null,
    (get, set, document: PHDocument | undefined) => {
        const fileNodeDocument = get(fileNodeDocumentAtom);
        if (!fileNodeDocument) {
            throw new Error('fileNodeDocument is undefined');
        } else if (!document) {
            set(fileNodeDocumentAtom, undefined);
        } else if (!isSameDocument(document, fileNodeDocument.document)) {
            set(fileNodeDocumentAtom, { ...fileNodeDocument, document });
        }
    },
);
const useSetSelectedDocument = () => useSetAtom(selectedDocumentAtom);

export function useFileNodeDocument() {
    useDebugValue('useFileNodeDocument');
    const selectedNodeId = useSelectedNodeId();
    const selectedDriveId = useSelectedDriveId();
    const { drive } = useDocumentDriveById(selectedDriveId);
    const sharingType = getDriveSharingType(drive);
    const { openFile, addOperations, onStrandUpdate, getSyncStatus } =
        useDocumentDriveServer();
    const syncStatus = drive ? getSyncStatus(drive.id, sharingType) : undefined;
    const { fetchDocument: fetchReadDocument } = useReadModeContext();
    const [fileNodeDocument, setFileNodeDocument] =
        useAtom(fileNodeDocumentAtom);
    const isReadMode = sharingType !== 'LOCAL' && syncStatus === undefined;
    const name = useSelectedNodeName();
    const kind = useSelectedNodeKind();
    const documentType = useSelectedNodeDocumentType();

    const setSelectedDocument = useSetSelectedDocument();
    const fetchDocument = useCallback(
        async (driveId: string, id: string, documentType: string) => {
            const document = await (isReadMode
                ? fetchReadDocument(driveId, id, documentType)
                : openFile(driveId, id));
            if (document instanceof Error) {
                throw document;
            }
            return document;
        },
        [fetchReadDocument, isReadMode, openFile],
    );

    useEffect(() => {
        // if selected node is undefine then clears fileNodeDocument
        if (!selectedDriveId || !selectedNodeId || !documentType) {
            if (fileNodeDocument) {
                setFileNodeDocument(undefined);
            }
            return;
        }

        // if selectedNode changes then fetches fileNodeDocument
        if (
            selectedDriveId !== fileNodeDocument?.driveId ||
            selectedNodeId !== fileNodeDocument.documentId ||
            documentType !== fileNodeDocument.documentType ||
            name !== fileNodeDocument.name
        ) {
            const changed = setFileNodeDocument({
                driveId: selectedDriveId,
                documentId: selectedNodeId,
                documentType,
                name: name || '',
                document: undefined,
                status: 'LOADING',
            });

            // if the selected file node changed then fetches the new document
            if (changed) {
                fetchDocument(selectedDriveId, selectedNodeId, documentType)
                    .then(document =>
                        setFileNodeDocument(
                            document
                                ? {
                                      driveId: selectedDriveId,
                                      documentId: selectedNodeId,
                                      documentType,
                                      document,
                                      name: name || '',
                                      status: 'LOADED',
                                  }
                                : {
                                      driveId: selectedDriveId,
                                      documentId: selectedNodeId,
                                      documentType,
                                      document,
                                      name: name || '',
                                      status: 'ERROR',
                                  },
                        ),
                    )
                    .catch(error => {
                        logger.error(error);
                        setFileNodeDocument({
                            driveId: selectedDriveId,
                            documentId: selectedNodeId,
                            documentType,
                            name: name || '',
                            document: undefined,
                            status: 'ERROR',
                        });
                    });
            }
        }
    }, [
        selectedDriveId,
        selectedNodeId,
        documentType,
        name,
        fetchDocument,
        fileNodeDocument,
        setFileNodeDocument,
    ]);

    useEffect(() => {
        if (
            !fileNodeDocument?.driveId ||
            !fileNodeDocument.documentId ||
            !fileNodeDocument.documentType
        ) {
            return;
        }

        // watches for strand updates to update the document
        const removeListener = onStrandUpdate(strand => {
            if (
                strand.driveId === fileNodeDocument.driveId &&
                strand.documentId === fileNodeDocument.documentId
            ) {
                fetchDocument(
                    fileNodeDocument.driveId,
                    fileNodeDocument.documentId,
                    fileNodeDocument.documentType,
                )
                    .then(setSelectedDocument)
                    .catch(logger.error);
            }
        });

        return removeListener;
    }, [
        fileNodeDocument?.driveId,
        fileNodeDocument?.documentId,
        fileNodeDocument?.documentType,
        onStrandUpdate,
        fetchDocument,
        setSelectedDocument,
    ]);

    const addOperationToSelectedDocument = useMemo(() => {
        if (selectedDriveId && selectedNodeId && kind === 'FILE') {
            return debounceOperations(operations =>
                addOperations(selectedDriveId, selectedNodeId, operations),
            );
        }
    }, [addOperations, selectedDriveId, selectedNodeId, kind]);

    const addOperationToSelectedDrive = useCallback(
        (operation: Operation) => {
            if (!selectedDriveId) {
                throw new Error('No drive node selected');
            }
            return debounceOperations(operations =>
                addOperations(selectedDriveId, undefined, operations),
            )(operation);
        },
        [addOperations, selectedDriveId],
    );

    const isSelectedDocument =
        kind === 'FILE' &&
        fileNodeDocument?.driveId === selectedDriveId &&
        fileNodeDocument?.documentId === selectedNodeId;
    const selectedDocument = isSelectedDocument
        ? fileNodeDocument?.document
        : undefined;

    return useMemo(
        () => ({
            fileNodeDocument,
            selectedDocument,
            setSelectedDocument,
            addOperationToSelectedDocument,
            addOperationToSelectedDrive,
        }),
        [
            fileNodeDocument,
            isSelectedDocument,
            selectedDocument,
            setSelectedDocument,
            addOperationToSelectedDocument,
            addOperationToSelectedDrive,
        ],
    );
}
