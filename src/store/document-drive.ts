import { Document } from 'document-model/document';
import { atom, useAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

export const selectedPath = atom<string | null>(null);
export const useSelectedPath = () => useAtom(selectedPath);

export const useFileNodeDocument = (drive?: string, id?: string) => {
    const { openFile, updateFile } = useDocumentDriveServer();
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
        if (drive && id) {
            fetchDocument(drive, id);
        } else {
            setSelectedDocument(undefined);
        }
    }, [drive, id]);

    async function saveDocument() {
        if (drive && id && selectedDocument) {
            // TODO this should add an operation to the child document
            await updateFile(drive, id, selectedDocument.documentType);
            await fetchDocument(drive, id);
        }
    }

    return [selectedDocument, setSelectedDocument, saveDocument] as const;
};
