import { FILE, TUiNodesContext } from '@powerhousedao/design-system';
import { Document, Operation } from 'document-model/document';
import { atom, useAtom, useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';
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

type FileNodeDocument =
    | {
          driveId: string;
          documentId: string;
          documentType: string;
          document: Document | undefined;
          status: 'LOADING' | 'ERROR';
      }
    | {
          driveId: string;
          documentId: string;
          documentType: string;
          document: Document;
          status: 'LOADED';
      }
    | undefined;

const documentCacheAtom = atom(new Map<string, Document>());

const singletonFileNodeDocumentAtom = atom<FileNodeDocument | undefined>(
    undefined,
);
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

const selectedDocumentAtom = selectAtom(
    fileNodeDocumentAtom,
    fileNode => fileNode?.document,
);

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
    const isReadMode = selectedDriveNode?.syncStatus === undefined;
    const driveId = selectedNode?.driveId;
    const documentId = selectedNode?.id;
    const kind = selectedNode?.kind;
    const documentType =
        kind === 'FILE' ? selectedNode?.documentType : undefined;

    const selectedDocument = useAtomValue(selectedDocumentAtom);
    const setSelectedDocument = useMemo(() => {
        function setSelectedDocument(document: Document | undefined) {
            if (!document) {
                setFileNodeDocument(undefined);
            } else if (fileNodeDocument) {
                setFileNodeDocument({ ...fileNodeDocument, document });
            } else {
                throw new Error('fileNodeDocument is undefined');
            }
        }
        return setSelectedDocument;
    }, [fileNodeDocument, setFileNodeDocument]);

    const fetchDocument = useCallback(
        async (driveId: string, id: string, documentType: string) => {
            try {
                const document = await (isReadMode
                    ? fetchReadDocument(driveId, id, documentType)
                    : openFile(driveId, id));
                if (document instanceof Error) {
                    throw document;
                }
                return document;
            } catch (error) {
                logger.error(error);
                return undefined;
            }
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
            documentType !== fileNodeDocument.documentType
        ) {
            const changed = setFileNodeDocument({
                driveId,
                documentId,
                documentType,
                document: undefined,
                status: 'LOADING',
            });

            // if the selected file node didn't change then does nothing
            if (!changed) {
                return;
            }
            fetchDocument(driveId, documentId, documentType)
                .then(document =>
                    setFileNodeDocument(
                        document
                            ? {
                                  driveId,
                                  documentId,
                                  documentType,
                                  document,
                                  status: 'LOADED',
                              }
                            : {
                                  driveId,
                                  documentId,
                                  documentType,
                                  document,
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
                        document: undefined,
                        status: 'ERROR',
                    });
                });

            // watches for strand updates to update the document
            const handler = onStrandUpdate(strand => {
                if (
                    strand.driveId === driveId &&
                    strand.documentId === documentId
                ) {
                    fetchDocument(driveId, documentId, documentType)
                        .then(setSelectedDocument)
                        .catch(logger.error);
                }
            });

            return () => {
                handler();
            };
        }
    }, [
        selectedNode,
        documentId,
        documentType,
        driveId,
        fetchDocument,
        fileNodeDocument,
        onStrandUpdate,
        setFileNodeDocument,
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

    return useMemo(
        () => ({
            selectedDocument: isSelectedDocument ? selectedDocument : undefined,
            setSelectedDocument,
            addOperationToSelectedDocument,
        }),
        [
            isSelectedDocument,
            selectedDocument,
            setSelectedDocument,
            addOperationToSelectedDocument,
        ],
    );
}
