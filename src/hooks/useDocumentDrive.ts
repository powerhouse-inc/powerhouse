import {
    DocumentDriveAction,
    DocumentDriveState,
} from 'document-model-libs/document-drive';
import { Document, utils } from 'document-model/document';
import { atom, useAtom } from 'jotai';
import { useEffect, useMemo } from 'react';
import { useTabs } from 'src/store';
import { useGetDocumentModel } from 'src/store/document-model';
import { loadFile } from 'src/utils/file';

export const documentDriveAtom = atom<Document<
    DocumentDriveState,
    DocumentDriveAction
> | null>(null);

export function useDocumentDrive() {
    const getDocumentModel = useGetDocumentModel();
    const { addTab, fromDocument, updateTab } = useTabs();

    const [documentDrive, setDocumentDrive] = useAtom(documentDriveAtom);

    async function fetchDocumentDrive() {
        try {
            const drive = await window.electronAPI?.documentDrive.request();

            setDocumentDrive(() => drive ?? null);
        } catch (error) {
            console.error(error);
            setDocumentDrive(null);
        }
    }

    useEffect(() => {
        fetchDocumentDrive();
    }, []);

    async function openFile(drive: string, path: string, tab?: string) {
        const document = await window.electronAPI?.documentDrive.openFile(
            drive,
            path
        );
        if (!document) {
            throw new Error(
                `There was an error opening file with ${path} on drive ${drive}`
            );
        }
        const documentTab = await fromDocument(document, tab);
        return tab ? updateTab(documentTab) : addTab(documentTab);
    }

    async function addFile(file: File, path: string, drive: string) {
        const document = await loadFile(file, getDocumentModel);
        const node = await window.electronAPI?.documentDrive.addFile(
            {
                drive,
                path,
                documentType: document.documentType,
                hash: utils.hashDocument(document),
                name: document.name || file.name,
            },
            document
        );
        await fetchDocumentDrive();
        return node;
    }

    async function deleteNode(drive: string, path: string) {
        await window.electronAPI?.documentDrive.deleteNode(drive, path);
        return fetchDocumentDrive();
    }

    return useMemo(
        () => ({ documentDrive, openFile, addFile, deleteNode }),
        [documentDrive]
    );
}
