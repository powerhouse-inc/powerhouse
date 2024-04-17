import {
    DriveType,
    ERROR,
    SharingType,
    getIsLocalDrive,
} from '@powerhousedao/design-system';
import {
    DriveInput,
    IDocumentDriveServer,
    RemoteDriveOptions,
    StrandUpdate,
    SyncStatus,
} from 'document-drive/server';
import { isDocumentDrive } from 'document-drive/utils';
import {
    DocumentDriveAction,
    actions,
    utils as documentDriveUtils,
    generateAddNodeAction,
    isFileNode,
    isFolderNode,
    reducer,
} from 'document-model-libs/document-drive';
import { Document, Operation, utils } from 'document-model/document';
import { useMemo } from 'react';
import { useGetDocumentModel } from 'src/store/document-model';
import { DefaultDocumentDriveServer } from 'src/utils/document-drive-server';
import { loadFile } from 'src/utils/file';
import { useDocumentDrives } from './useDocumentDrives';
import { useIsAllowedToCreateDocuments } from './useIsAllowedToCreateDocuments';

// TODO this should be added to the document model
export interface SortOptions {
    afterNodePath?: string;
}

export function useDocumentDriveServer(
    server: IDocumentDriveServer | undefined = DefaultDocumentDriveServer,
) {
    const isAllowedToCreateDocuments = useIsAllowedToCreateDocuments();

    if (!server) {
        throw new Error('Invalid Document Drive Server');
    }

    const getDocumentModel = useGetDocumentModel();

    const [documentDrives, refreshDocumentDrives] = useDocumentDrives(server);

    async function openFile(drive: string, id: string) {
        const document = await server.getDocument(drive, id);
        if (!document) {
            throw new Error(
                `There was an error opening file with id ${id} on drive ${drive}`,
            );
        }
        return document;
    }

    async function _addDriveOperation(
        driveId: string,
        action: DocumentDriveAction,
    ) {
        if (!server) {
            throw new Error('Server is not defined');
        }

        let drive = documentDrives.find(
            drive => drive.state.global.id === driveId,
        );
        if (!drive) {
            throw new Error(`Drive with id ${driveId} not found`);
        }

        drive = reducer(drive, action);
        const scope = action.scope ?? 'global';
        const operations = drive.operations[scope];
        const operation = operations.findLast(op => op.type === action.type);
        if (!operation) {
            throw new Error('There was an error applying the operation');
        }

        try {
            const result = await server.addDriveOperation(driveId, operation);

            if (result.status !== 'SUCCESS') {
                console.error(result.error);
            }

            if (result.operations.length) {
                await refreshDocumentDrives();
            }

            if (result.document && !isDocumentDrive(result.document)) {
                throw new Error('Received document is not a Document Drive');
            }
            return result.document;
        } catch (error) {
            console.error(error);
            return drive;
        }
    }

    async function addDocument(
        driveId: string,
        name: string,
        documentType: string,
        parentFolder?: string,
        document?: Document,
    ) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to create documents');
        }

        const id = utils.hashKey();

        let drive = documentDrives.find(d => d.state.global.id === driveId);
        if (!drive) {
            throw new Error(`Drive with id ${driveId} not found`);
        }

        const action = generateAddNodeAction(
            drive.state.global,
            {
                id,
                name,
                parentFolder,
                documentType,

                document,
            },
            ['global'],
        );

        drive = await _addDriveOperation(driveId, action);

        const node = drive?.state.global.nodes.find(node => node.id === id);
        if (!node || !isFileNode(node)) {
            throw new Error('There was an error adding document');
        }

        return node;
    }

    async function addFile(
        file: string | File,
        drive: string,
        name?: string,
        parentFolder?: string,
    ) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to create files');
        }
        const document = await loadFile(file, getDocumentModel);
        return addDocument(
            drive,
            name || (typeof file === 'string' ? document.name : file.name),
            document.documentType,
            parentFolder,
            document,
        );
    }

    async function updateFile(
        driveId: string,
        id: string,
        documentType?: string,
        name?: string,
        parentFolder?: string,
    ) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to update files');
        }
        const drive = await _addDriveOperation(
            driveId,
            actions.updateFile({
                id,
                name: name || undefined,
                parentFolder,
                documentType,
            }),
        );

        const node = drive?.state.global.nodes.find(node => node.id === id);
        if (!node || !isFileNode(node)) {
            throw new Error('There was an error updating document');
        }
        return node;
    }

    async function addFolder(
        driveId: string,
        name: string,
        parentFolder?: string,
    ) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to create folders');
        }
        const id = utils.hashKey();
        const drive = await _addDriveOperation(
            driveId,
            actions.addFolder({
                id,
                name,
                parentFolder,
            }),
        );

        const node = drive?.state.global.nodes.find(node => node.id === id);
        if (!node || !isFolderNode(node)) {
            throw new Error('There was an error adding folder');
        }
        return node;
    }

    async function deleteNode(drive: string, id: string) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to delete documents');
        }
        await _addDriveOperation(
            drive,
            actions.deleteNode({
                id,
            }),
        );
    }

    async function renameNode(driveId: string, id: string, name: string) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to rename documents');
        }
        const drive = await _addDriveOperation(
            driveId,
            actions.updateNode({
                id,
                name,
            }),
        );

        const node = drive?.state.global.nodes.find(node => node.id === id);
        if (!node) {
            throw new Error('There was an error renaming node');
        }
        return node;
    }

    async function copyOrMoveNode(
        driveId: string,
        srcId: string,
        targetId: string,
        operation: string,
        targetName?: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- TODO: use this later for sorting
        sortOptions?: SortOptions,
    ) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to copy or move nodes');
        }
        if (srcId === targetId) return;

        const drive = documentDrives.find(
            drive => drive.state.global.id === driveId,
        );

        if (operation === 'copy' && drive) {
            const targetParentFolder = targetId === '' ? null : targetId;
            const generateId = () => utils.hashKey();

            const copyNodesInput = documentDriveUtils.generateNodesCopy(
                {
                    srcId,
                    targetParentFolder,
                    ...(targetName && { targetName }),
                },
                generateId,
                drive.state.global.nodes,
            );

            const copyActions = copyNodesInput.map(copyNodeInput =>
                actions.copyNode(copyNodeInput),
            );

            const result = await server.addDriveActions(driveId, copyActions);
            if (result.operations.length) {
                await refreshDocumentDrives();
            } else if (result.status !== 'SUCCESS') {
                console.error(
                    `Error copying files: ${result.status}`,
                    result.error,
                );
            }
        } else {
            await _addDriveOperation(
                driveId,
                actions.moveNode({
                    srcFolder: srcId,
                    targetParentFolder: targetId,
                }),
            );

            if (targetName) {
                await renameNode(driveId, srcId, targetName);
            }
        }
    }

    async function addOperation(
        driveId: string,
        id: string,
        operation: Operation,
    ) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to add operations');
        }
        if (!server) {
            throw new Error('Server is not defined');
        }

        const drive = documentDrives.find(
            drive => drive.state.global.id === driveId,
        );
        if (!drive) {
            throw new Error(`Drive with id ${driveId} not found`);
        }

        const newDocument = await server.addOperation(driveId, id, operation);
        return newDocument.document;
    }

    async function addOperations(
        driveId: string,
        id: string,
        operations: Operation[],
    ) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to add operations');
        }
        if (!server) {
            throw new Error('Server is not defined');
        }

        const drive = documentDrives.find(
            drive => drive.state.global.id === driveId,
        );
        if (!drive) {
            throw new Error(`Drive with id ${driveId} not found`);
        }

        const newDocument = await server.addOperations(driveId, id, operations);
        return newDocument.document;
    }

    async function addDrive(drive: DriveInput) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to create drives');
        }
        const id = drive.global.id || utils.hashKey();
        drive = documentDriveUtils.createState(drive);
        await server.addDrive({
            global: { ...drive.global, id },
            local: drive.local,
        });
        await refreshDocumentDrives();
    }

    async function addRemoteDrive(url: string, options: RemoteDriveOptions) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to create drives');
        }
        await server.addRemoteDrive(url, options);
        await refreshDocumentDrives();
    }

    async function deleteDrive(id: string) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to delete drives');
        }
        if (!server) {
            throw new Error('Server is not defined');
        }

        const drive = documentDrives.find(
            drive => drive.state.global.id === id,
        );
        if (!drive) {
            throw new Error(`Drive with id ${id} not found`);
        }
        await server.deleteDrive(id);
        return refreshDocumentDrives();
    }

    async function renameDrive(id: string, name: string) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to rename drives');
        }
        return _addDriveOperation(id, actions.setDriveName({ name }));
    }

    async function setDriveAvailableOffline(
        id: string,
        availableOffline: boolean,
    ) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to change drive availability');
        }
        return _addDriveOperation(
            id,
            actions.setAvailableOffline({ availableOffline }),
        );
    }

    async function setDriveSharingType(id: string, sharingType: SharingType) {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to change drive availability');
        }
        return _addDriveOperation(
            id,
            actions.setSharingType({ type: sharingType }),
        );
    }

    function getChildren(driveId: string, id?: string) {
        return (
            documentDrives
                .find(drive => drive.state.global.id === driveId)
                ?.state.global.nodes.filter(node =>
                    id ? node.parentFolder === id : !node.parentFolder,
                ) ?? []
        );
    }

    async function getSyncStatus(
        driveId: string,
        type: DriveType,
    ): Promise<SyncStatus | undefined> {
        if (getIsLocalDrive(type)) return;
        try {
            return server.getSyncStatus(driveId);
        } catch (error) {
            console.error(error);
            return ERROR;
        }
    }

    function onStrandUpdate(cb: (update: StrandUpdate) => void) {
        return server.on('strandUpdate', cb);
    }

    function onSyncStatus(
        cb: (driveId: string, status: SyncStatus, error?: Error) => void,
    ) {
        return server.on('syncStatus', cb);
    }

    async function clearStorage() {
        await server.clearStorage();
        await refreshDocumentDrives();
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
            addOperation,
            addOperations,
            getChildren,
            addDrive,
            addRemoteDrive,
            deleteDrive,
            renameDrive,
            setDriveAvailableOffline,
            setDriveSharingType,
            getSyncStatus,
            onStrandUpdate,
            onSyncStatus,
            clearStorage,
        }),
        [documentDrives],
    );
}
