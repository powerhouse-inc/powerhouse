import {
    DocumentDriveAction,
    DocumentDriveState,
} from 'document-model-libs/document-drive';
import { Document, Immutable, utils } from 'document-model/document';
import { atom, useAtom } from 'jotai';
import { useEffect, useMemo } from 'react';
import { IDocumentDrive, SortOptions } from 'src/services/document-drive';
import { useTabs } from 'src/store';
import { useGetDocumentModel } from 'src/store/document-model';
import { loadFile } from 'src/utils/file';

export const documentDriveAtom = atom<Immutable<
    Document<DocumentDriveState, DocumentDriveAction>
> | null>(null);

export function useDocumentDrive(
    documentDrive: IDocumentDrive | undefined = window.electronAPI
        ?.documentDrive
) {
    const getDocumentModel = useGetDocumentModel();
    const { addTab, fromDocument, updateTab } = useTabs();

    const [document, setDocument] = useAtom(documentDriveAtom);

    async function fetchDocumentDrive() {
        try {
            const drive = await documentDrive?.getDocument();
            setDocument(drive ?? null);
        } catch (error) {
            console.error(error);
            setDocument(null);
        }
    }

    useEffect(() => {
        fetchDocumentDrive();
    }, []);

    async function openFile(drive: string, path: string, tab?: string) {
        const document = await documentDrive?.openFile(drive, path);
        if (!document) {
            throw new Error(
                `There was an error opening file with ${path} on drive ${drive}`
            );
        }
        const documentTab = await fromDocument(document, tab);
        return tab ? updateTab(documentTab) : addTab(documentTab);
    }

    async function addFile(file: File, drive: string, path: string) {
        const document = await loadFile(file, getDocumentModel);
        const node = await documentDrive?.addFile(
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

    async function addFolder(drive: string, path: string, name = '') {
        const node = await documentDrive?.addFolder({
            drive,
            path,
            hash: '',
            name,
        });
        await fetchDocumentDrive();
        return node;
    }

    async function deleteNode(drive: string, path: string) {
        await documentDrive?.deleteNode(drive, path);
        return fetchDocumentDrive();
    }

    async function renameNode(drive: string, path: string, name: string) {
        await documentDrive?.renameNode(drive, path, name);
        return fetchDocumentDrive();
    }

    async function copyOrMoveNode(
        drive: string,
        srcPath: string,
        destPath: string,
        operation: string,
        sortOptions?: SortOptions
    ) {
        await documentDrive?.copyOrMoveNode(
            drive,
            srcPath,
            destPath,
            operation,
            sortOptions
        );
        return fetchDocumentDrive();
    }

    return useMemo(
        () => ({
            documentDrive: document,
            openFile,
            addFile,
            addFolder,
            deleteNode,
            renameNode,
            copyOrMoveNode,
        }),
        [document]
    );
}
