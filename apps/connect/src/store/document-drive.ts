import { FILE, TUiNodesContext } from '@powerhousedao/design-system';
import { Document, Operation } from 'document-model/document';
import { hashDocument } from 'document-model/utils';
import { atom, useAtom, useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo } from 'react';
import { IReadModeContext } from 'src/context/read-mode';
import { documentToHash } from 'src/hooks/useDocumentDrives';
import { TDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';
import { logger } from 'src/services/logger';

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

export type FileNodeDocument =
    | {
          driveId: string;
          documentId: string;
          documentType: string;
          name: string;
          document: Document | undefined;
          status: 'LOADING' | 'ERROR';
      }
    | {
          driveId: string;
          documentId: string;
          documentType: string;
          name: string;
          document: Document;
          status: 'LOADED';
      }
    | undefined;

const documentCacheAtom = atom(new Map<string, Document>());

const singletonFileNodeDocumentAtom = atom<FileNodeDocument>(undefined);

export function isSameDocument(
    prev: Document | undefined,
    next: Document | undefined,
) {
    if (prev === next) {
        return true;
    }
    if (!prev || !next) {
        return false;
    }
    if (hashDocument(prev) === hashDocument(next)) {
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
    (get, set, document: Document | undefined) => {
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

export function useFileNodeDocument(
    props: TUiNodesContext & TDocumentDriveServer & IReadModeContext,
) {
    const {
        selectedNode,
        selectedDriveNode,
        openFile,
        addOperations,
        onStrandUpdate,
        fetchDocument: fetchReadDocument,
    } = props;
    const [fileNodeDocument, setFileNodeDocument] =
        useAtom(fileNodeDocumentAtom);
    const isReadMode =
        selectedDriveNode?.sharingType !== 'LOCAL' &&
        selectedDriveNode?.syncStatus === undefined;
    const driveId = selectedNode?.driveId;
    const documentId = selectedNode?.id;
    const name = selectedNode?.name;
    const kind = selectedNode?.kind;
    const documentType =
        kind === 'FILE' ? selectedNode?.documentType : undefined;

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
        if (!driveId || !documentId || !documentType) {
            if (fileNodeDocument) {
                setFileNodeDocument(undefined);
            }
            return;
        }

        // if selectedNode changes then fetches fileNodeDocument
        if (
            driveId !== fileNodeDocument?.driveId ||
            documentId !== fileNodeDocument.documentId ||
            documentType !== fileNodeDocument.documentType ||
            name !== fileNodeDocument.name
        ) {
            const changed = setFileNodeDocument({
                driveId,
                documentId,
                documentType,
                name: name || '',
                document: undefined,
                status: 'LOADING',
            });

            // if the selected file node changed then fetches the new document
            if (changed) {
                fetchDocument(driveId, documentId, documentType)
                    .then(document =>
                        setFileNodeDocument(
                            document
                                ? {
                                      driveId,
                                      documentId,
                                      documentType,
                                      document,
                                      name: name || '',
                                      status: 'LOADED',
                                  }
                                : {
                                      driveId,
                                      documentId,
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
                            driveId,
                            documentId,
                            documentType,
                            name: name || '',
                            document: undefined,
                            status: 'ERROR',
                        });
                    });
            }
        }
    }, [
        selectedNode,
        documentId,
        documentType,
        name,
        driveId,
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
        if (driveId && documentId && kind === FILE) {
            return debounceOperations(operations =>
                addOperations(driveId, documentId, operations),
            );
        }
    }, [addOperations, driveId, documentId, kind]);

    const isSelectedDocument =
        kind === FILE &&
        fileNodeDocument?.driveId === driveId &&
        fileNodeDocument?.documentId === documentId;
    const selectedDocument = isSelectedDocument
        ? fileNodeDocument?.document
        : undefined;

    return useMemo(
        () => ({
            fileNodeDocument,
            selectedDocument,
            setSelectedDocument,
            addOperationToSelectedDocument,
        }),
        [
            fileNodeDocument,
            isSelectedDocument,
            selectedDocument,
            setSelectedDocument,
            addOperationToSelectedDocument,
        ],
    );
}
