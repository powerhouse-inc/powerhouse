import { Document, Operation } from 'document-model/document';
import { atom, useAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { useDocumentDriveServer } from 'src/hooks/useDocumentDriveServer';

export const selectedPath = atom<string | null>(null);
export const useSelectedPath = () => useAtom(selectedPath);

export const useFileNodeDocument = (drive?: string, id?: string) => {
    const { openFile, addOperation: _addOperation } = useDocumentDriveServer();
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

    async function addOperation(operation: Operation) {
        if (drive && id) {
            const document = await _addOperation(drive, id, operation);
            // TODO check new remote document vs local document
            setSelectedDocument(document);
        }
    }

    return [selectedDocument, setSelectedDocument, addOperation] as const;
};
