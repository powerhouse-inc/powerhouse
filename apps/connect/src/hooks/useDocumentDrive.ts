import {
    DocumentDriveAction,
    DocumentDriveState,
} from 'document-model-libs/document-drive';
import { Document } from 'document-model/document';
import { useEffect, useState } from 'react';
import { useTabs } from 'src/store';
import { useGetDocumentModel } from 'src/store/document-model';
import { loadFile } from 'src/utils/file';

export function useDocumentDrive() {
    const getDocumentModel = useGetDocumentModel();
    const { addTab, fromDocument } = useTabs();

    const [documentDrive, setDocumentDrive] = useState<Document<
        DocumentDriveState,
        DocumentDriveAction
    > | null>(null);

    async function fetchDocumentDrive() {
        try {
            const drive = await window.electronAPI?.documentDrive.request();
            setDocumentDrive(drive ?? null);
        } catch (error) {
            console.error(error);
            setDocumentDrive(null);
        }
    }

    useEffect(() => {
        fetchDocumentDrive();
    }, []);

    async function openFile(path: string, drive: string) {
        const file = await window.electronAPI?.documentDrive.openfile(
            path,
            drive
        );
        const document = await loadFile(file, getDocumentModel);
        const tab = await fromDocument(document);
        addTab(tab);
    }

    async function duplicateFile(oath: string, drive: string) {
        // const file = await window.electronAPI?.documentDrive.(path, drive);
        // const document = await loadFile(await file, getDocumentModel);
        // const tab = await fromDocument(document);
        // addTab(tab);
    }

    return { documentDrive, openFile, duplicateFile };
}
