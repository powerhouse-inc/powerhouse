import { IDocumentDriveServer } from 'document-drive/server';
import { isDocumentDrive } from 'document-drive/utils';
import {
    DocumentDriveAction,
    DocumentDriveDocument,
    actions,
    isFileNode,
    isFolderNode,
    reducer,
} from 'document-model-libs/document-drive';
import { Document, utils } from 'document-model/document';
import { atom, useAtom } from 'jotai';
import { useEffect, useMemo } from 'react';
import { useGetDocumentModel } from 'src/store/document-model';
import { loadFile } from 'src/utils/file';

export const documentDrivesAtom = atom<DocumentDriveDocument[]>([]);

// TODO this should be added to the document model
export interface SortOptions {
    afterNodePath?: string;
}

export function useDocumentDriveServer(
    server: IDocumentDriveServer | undefined = window.electronAPI?.documentDrive
) {
    const getDocumentModel = useGetDocumentModel();

    const [documentDrives, setDocumentDrives] = useAtom(documentDrivesAtom);

    async function fetchDocumentDrives() {
        if (!server) {
            return setDocumentDrives([]);
        }
        try {
            const driveIds = await server?.getDrives();
            const drives = await Promise.all(
                driveIds.map(id => server.getDrive(id))
            );
            setDocumentDrives(drives);
        } catch (error) {
            console.error(error);
            setDocumentDrives([]);
        }
    }

    useEffect(() => {
        if (!documentDrives.length) {
            fetchDocumentDrives();
        }
    }, []);

    async function openFile(drive: string, id: string) {
        const document = await server?.getDocument(drive, id);
        if (!document) {
            throw new Error(
                `There was an error opening file with id ${id} on drive ${drive}`
            );
        }
        return document;
    }

    async function _addDriveOperation(
        driveId: string,
        action: DocumentDriveAction
    ) {
        if (!server) {
            throw new Error('Server is not defined');
        }

        let drive = documentDrives.find(drive => drive.state.id === driveId);
        if (!drive) {
            throw new Error(`Drive with id ${driveId} not found`);
        }

        drive = reducer(drive, action);

        const operation = drive.operations.findLast(
            op => op.type === action.type
        );
        if (!operation) {
            throw new Error('There was an error applying the operation');
        }

        const newDrive = await server.addOperation(driveId, '', operation);

        await fetchDocumentDrives();

        if (!isDocumentDrive(newDrive)) {
            throw new Error('Received document is not a Document Drive');
        }
        return newDrive as DocumentDriveDocument;
    }

    async function addDocument(
        document: Document,
        driveId: string,
        name: string,
        parentFolder?: string
    ) {
        const id = utils.hashKey();
        const drive = await _addDriveOperation(
            driveId,
            actions.addFile({
                id,
                name: name ?? document.name,
                parentFolder,
                documentType: document.documentType,
                // TODO Add support for document as initial state
            })
        );

        const node = drive.state.nodes.find(node => node.id === id);
        if (!node || !isFileNode(node)) {
            throw new Error('There was an error adding document');
        }
        return node;
    }

    async function addFile(file: string | File, drive: string, name?: string) {
        const document = await loadFile(file, getDocumentModel);
        return addDocument(
            document,
            drive,
            name || typeof file === 'string' ? document.name : file.name
        );
    }

    async function updateFile(
        driveId: string,
        id: string,
        documentType?: string,
        name?: string,
        parentFolder?: string
    ) {
        const drive = await _addDriveOperation(
            driveId,
            actions.updateFile({
                id,
                name: name || undefined,
                parentFolder,
                documentType,
            })
        );

        const node = drive.state.nodes.find(node => node.id === id);
        if (!node || !isFileNode(node)) {
            throw new Error('There was an error updating document');
        }
        return node;
    }

    async function addFolder(
        driveId: string,
        name: string,
        parentFolder?: string
    ) {
        const id = utils.hashKey();
        const drive = await _addDriveOperation(
            driveId,
            actions.addFolder({
                id,
                name,
                parentFolder,
            })
        );

        const node = drive.state.nodes.find(node => node.id === id);
        if (!node || !isFolderNode(node)) {
            throw new Error('There was an error adding folder');
        }
        return node;
    }

    async function deleteNode(drive: string, id: string) {
        await _addDriveOperation(
            drive,
            actions.deleteNode({
                id,
            })
        );
    }

    async function renameNode(driveId: string, id: string, name: string) {
        const drive = await _addDriveOperation(
            driveId,
            actions.updateNode({
                id,
                name,
            })
        );

        const node = drive.state.nodes.find(node => node.id === id);
        if (!node) {
            throw new Error('There was an error renaming node');
        }
        return node;
    }

    async function copyOrMoveNode(
        drive: string,
        srcPath: string,
        destPath: string,
        operation: string,
        sortOptions?: SortOptions
    ) {
        // TODO
        // await documentDrive?.copyOrMoveNode(
        //     drive,
        //     srcPath,
        //     destPath,
        //     operation,
        //     sortOptions
        // );
        // return fetchDocumentDrive();
    }

    function getChildren(driveId: string, id?: string) {
        return (
            documentDrives
                .find(drive => drive.state.id === driveId)
                ?.state.nodes.filter(node =>
                    id ? node.parentFolder === id : !node.parentFolder
                ) ?? []
        );
    }

    return useMemo(
        () => ({
            documentDrives,
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
        [documentDrives]
    );
}
