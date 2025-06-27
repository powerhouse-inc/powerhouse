import { type GetDocumentOptions } from 'document-drive';
import { type PHDocumentHeader, type PHDocument } from 'document-model';
import { useEffect, useState } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer';

const DELETE_NODE_OPERATION_TYPE = 'DELETE_NODE';

type DeleteOperationInput = { id: string };

export type HookState = PHDocument['state'] &
    Pick<
        PHDocumentHeader,
        'documentType' | 'revision' | 'createdAtUtcIso' | 'lastModifiedAtUtcIso'
    >;

export interface UseGetDriveDocumentsProps {
    driveId?: string;
    documentIds?: string[];
    options?: GetDocumentOptions;
}

export function useGetDriveDocuments(props: UseGetDriveDocumentsProps) {
    const { driveId } = props;
    const [documents, setDocuments] = useState<Record<string, HookState>>({});

    const { getDocumentsIds, openFile, onOperationsAdded } =
        useDocumentDriveServer();

    const fetchDocuments = async (
        _driveId: string,
        _documentIds?: string[],
        _deletedNodes: string[] = [],
    ) => {
        let documentIds = _documentIds;

        if (!documentIds || documentIds.length === 0) {
            documentIds = await getDocumentsIds(_driveId);
        }

        const getDocumentsPromise = documentIds.map<
            Promise<[string, PHDocument]>
        >(async documentId => {
            const document = await openFile(_driveId, documentId);
            return [documentId, document];
        });

        const docs = await Promise.all(getDocumentsPromise);

        const newDocumentsState = docs.reduce<Record<string, HookState>>(
            (acc, [documentId, document]) => {
                acc[documentId] = {
                    ...document.state,
                    documentType: document.header.documentType,
                    revision: document.header.revision,
                    createdAtUtcIso: document.header.createdAtUtcIso,
                    lastModifiedAtUtcIso: document.header.lastModifiedAtUtcIso,
                };
                return acc;
            },
            {},
        );

        setDocuments(prevState => ({
            ...prevState,
            ...newDocumentsState,
        }));

        if (_deletedNodes.length > 0) {
            setDocuments(prevState => {
                const newState = { ...prevState };
                _deletedNodes.forEach(nodeId => {
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                    delete newState[nodeId];
                });
                return newState;
            });
        }
    };

    useEffect(() => {
        if (driveId) {
            fetchDocuments(driveId).catch(console.error);
        }
    }, [driveId]);

    useEffect(() => {
        const removeListener = onOperationsAdded(
            (driveId, documentId, operations) => {
                const deletedNodes: string[] = [];

                if (driveId === driveId && !documentId) {
                    const deletedNodesIds = operations
                        .filter(op => op.type === DELETE_NODE_OPERATION_TYPE)
                        .map(op => (op.input as DeleteOperationInput).id);

                    deletedNodes.push(...deletedNodesIds);
                }

                if (driveId === driveId) {
                    const docId = documentId ? [documentId] : undefined;
                    fetchDocuments(driveId, docId, deletedNodes).catch(
                        console.error,
                    );
                }
            },
        );

        return removeListener;
    }, [onOperationsAdded, driveId]);

    return [documents, fetchDocuments] as const;
}
