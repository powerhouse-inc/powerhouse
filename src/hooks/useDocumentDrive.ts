import {
    DocumentDriveAction,
    DocumentDriveState,
} from 'document-model-libs/document-drive';
import { Document, Immutable, utils } from 'document-model/document';
import { atom, useAtom } from 'jotai';
import { join } from 'path';
import { useEffect, useMemo } from 'react';
import sanitize from 'sanitize-filename';
import { IDocumentDrive, SortOptions } from 'src/services/document-drive';
import { useGetDocumentModel } from 'src/store/document-model';
import { loadFile } from 'src/utils/file';

export const documentDriveAtom = atom<Immutable<
    Document<DocumentDriveState, DocumentDriveAction>
> | null>(null);

export const isChildrenRootNode = (path: string, childrenPath: string) => {
    const isChildrenNode = childrenPath.startsWith(path);
    if (!isChildrenNode) return false;

    const parentSegments = path.split('/').length;
    const childrenSegments = childrenPath.split('/').length;

    const isChildrenRoot = parentSegments + 1 === childrenSegments;
    return isChildrenRoot;
};

export function useDocumentDrive(
    documentDrive: IDocumentDrive | undefined = window.electronAPI
        ?.documentDrive
) {
    const getDocumentModel = useGetDocumentModel();

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
        if (!document) {
            fetchDocumentDrive();
        }
    }, []);

    async function openFile(drive: string, path: string) {
        const document = await documentDrive?.openFile(drive, path);
        if (!document) {
            throw new Error(
                `There was an error opening file with ${path} on drive ${drive}`
            );
        }
        return document;
    }

    async function addDocument(
        document: Document,
        drive: string,
        path: string,
        name: string
    ) {
        if (path === drive || path == '.') {
            path = '';
        }

        const node = await documentDrive?.addFile(
            {
                drive,
                path: join(path, sanitize(name ?? document.name)),
                documentType: document.documentType,
                hash: utils.hashDocument(document),
                name: name ?? document.name,
            },
            document
        );
        await fetchDocumentDrive();
        return node;
    }

    async function addFile(file: string | File, drive: string, path: string) {
        const document = await loadFile(file, getDocumentModel);
        return addDocument(
            document,
            drive,
            path,
            typeof file === 'string' ? document.name : file.name
        );
    }

    async function updateFile(document: Document, drive: string, path: string) {
        const node = await documentDrive?.updateFile(
            {
                drive,
                path,
                documentType: document.documentType,
                hash: utils.hashDocument(document),
                name: document.name || undefined,
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

    function getChildren(drive: string, path?: string) {
        const nodes =
            document?.state.drives.find(item => item.id === drive)?.nodes ?? [];
        return nodes.filter(node =>
            path
                ? isChildrenRootNode(path, node.path)
                : !node.path.includes('/')
        );
    }

    return useMemo(
        () => ({
            documentDrive: document,
            addDocument,
            openFile,
            addFile,
            updateFile,
            addFolder,
            deleteNode,
            renameNode,
            copyOrMoveNode,
            getChildren,
        }),
        [document]
    );
}
