import { type GetDocumentOptions } from 'document-drive';
import { PHDocumentHeader, type PHDocument } from 'document-model';
import { useEffect, useState } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer';

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

    const { getDocumentsIds, onStrandUpdate, openFile } =
        useDocumentDriveServer();

    const fetchDocuments = async (
        _driveId: string,
        _documentIds?: string[],
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
    };

    useEffect(() => {
        if (driveId) {
            fetchDocuments(driveId).catch(console.error);
        }
    }, [driveId]);

    useEffect(() => {
        const removeListener = onStrandUpdate(update => {
            if (driveId && update.driveId === driveId && update.documentId) {
                fetchDocuments(driveId, [update.documentId]).catch(
                    console.error,
                );
            }
        });

        return removeListener;
    }, [onStrandUpdate, driveId]);

    return [documents, fetchDocuments] as const;
}
