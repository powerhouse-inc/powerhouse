import { Document } from 'document-model/document';
import { atom, useAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { useDocumentDrive } from 'src/hooks/useDocumentDrive';

export const selectedPath = atom<string | null>(null);
export const useSelectedPath = () => useAtom(selectedPath);

export const useFileNodeDocument = (drive?: string, path?: string) => {
    const { openFile, updateFile } = useDocumentDrive();
    const [selectedDocument, setSelectedDocument] = useState<
        Document | undefined
    >();

    async function fetchDocument(drive: string, path: string) {
        try {
            const document = await openFile(drive, path);
            setSelectedDocument(document);
        } catch (error) {
            setSelectedDocument(undefined);
            console.error(error);
        }
    }

    useEffect(() => {
        if (drive && path) {
            fetchDocument(drive, path);
        } else {
            setSelectedDocument(undefined);
        }
    }, [drive, path]);

    async function saveDocument() {
        if (drive && path && selectedDocument) {
            await updateFile(selectedDocument, drive, path);
            await fetchDocument(drive, path);
        }
    }

    return [selectedDocument, setSelectedDocument, saveDocument] as const;
};
