import { type GetDocumentOptions } from 'document-drive';
import { type PHDocumentHeader, type PHDocument } from 'document-model';
import { useCallback } from 'react';
import { useDocumentDriveServer } from './useDocumentDriveServer';

export type HookState = PHDocument['state'] &
    Pick<
        PHDocumentHeader,
        'documentType' | 'revision' | 'createdAtUtcIso' | 'lastModifiedAtUtcIso'
    >;

export interface UseGetDriveDocumentsProps {
    documentIds?: string[];
    options?: GetDocumentOptions;
}

export function useGetDocument() {
    const { openFile } = useDocumentDriveServer();

    const getDocument = useCallback(
        async (documentId: string, options?: GetDocumentOptions) => {
            const document = await openFile(documentId, options);
            return document;
        },
        [openFile],
    );

    return getDocument;
}
