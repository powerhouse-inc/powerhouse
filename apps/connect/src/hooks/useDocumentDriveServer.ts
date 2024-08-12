import {
    ERROR,
    FILE,
    LOCAL,
    SharingType,
    UiNode,
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
    DocumentDriveLocalState,
    DocumentDriveState,
    Trigger,
    actions,
    utils as documentDriveUtils,
    generateAddNodeAction,
    isFileNode,
    isFolderNode,
    reducer,
} from 'document-model-libs/document-drive';
import { Document, Operation, utils } from 'document-model/document';
import { useCallback, useMemo } from 'react';
import { logger } from 'src/services/logger';
import { useGetDocumentModel } from 'src/store/document-model';
import { useUser } from 'src/store/user';
import { DefaultDocumentDriveServer } from 'src/utils/document-drive-server';
import { loadFile } from 'src/utils/file';
import { addActionContext, signOperation } from 'src/utils/signature';
import { useConnectCrypto, useConnectDid } from './useConnectCrypto';
import { useDocumentDrives } from './useDocumentDrives';
import { useUserPermissions } from './useUserPermissions';

export const FILE_UPLOAD_OPERATIONS_CHUNK_SIZE =
    parseInt(import.meta.env.FILE_UPLOAD_OPERATIONS_CHUNK_SIZE as string) || 50;

// TODO this should be added to the document model
export interface SortOptions {
    afterNodePath?: string;
}

export function useDocumentDriveServer(
    server: IDocumentDriveServer | undefined = DefaultDocumentDriveServer,
) {
    const { isAllowedToCreateDocuments, isAllowedToEditDocuments } =
        useUserPermissions();
    const user = useUser();
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();

    if (!server) {
        throw new Error('Invalid Document Drive Server');
    }

    const getDocumentModel = useGetDocumentModel();

    const [documentDrives, refreshDocumentDrives, , documentDrivesStatus] =
        useDocumentDrives(server);

    const openFile = useCallback(
        async (drive: string, id: string) => {
            const document = await server.getDocument(drive, id);
            if (!document) {
                throw new Error(
                    `There was an error opening file with id ${id} on drive ${drive}`,
                );
            }
            return document;
        },
        [server],
    );

    const _addDriveOperation = useCallback(
        async (driveId: string, action: DocumentDriveAction) => {
            if (!server) {
                throw new Error('Server is not defined');
            }

            let drive = documentDrives.find(
                drive => drive.state.global.id === driveId,
            );
            if (!drive) {
                throw new Error(`Drive with id ${driveId} not found`);
            }

            const driveCopy = { ...drive };

            drive = reducer(drive, addActionContext(action, connectDid, user));
            const scope = action.scope ?? 'global';
            const operations = drive.operations[scope];
            const operation = operations.findLast(
                op => op.type === action.type,
            );
            if (!operation) {
                throw new Error('There was an error applying the operation');
            }

            // sign operation
            const signedOperation = await signOperation<
                DocumentDriveState,
                DocumentDriveAction,
                DocumentDriveLocalState
            >(
                operation as Operation<DocumentDriveAction>,
                sign,
                driveId,
                driveCopy,
                reducer,
                user,
            );

            try {
                const result = await server.queueDriveOperation(
                    driveId,
                    signedOperation,
                );

                if (result.status !== 'SUCCESS') {
                    logger.error(result.error);
                }

                if (result.operations.length) {
                    await refreshDocumentDrives();
                }

                if (result.document && !isDocumentDrive(result.document)) {
                    throw new Error(
                        'Received document is not a Document Drive',
                    );
                }
                return result.document;
            } catch (error) {
                logger.error(error);
                return drive;
            }
        },
        [documentDrives, refreshDocumentDrives, server, sign, user, connectDid],
    );

    const addDocument = useCallback(
        async (
            driveId: string,
            name: string,
            documentType: string,
            parentFolder?: string,
            document?: Document,
        ) => {
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
                    parentFolder: parentFolder ?? null,
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
        },
        [_addDriveOperation, documentDrives, isAllowedToCreateDocuments],
    );

    const addOperations = useCallback(
        async (driveId: string, id: string, operations: Operation[]) => {
            if (!isAllowedToEditDocuments) {
                throw new Error('User is not allowed to edit documents');
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

            const newDocument = await server.queueOperations(
                driveId,
                id,
                operations,
            );
            return newDocument.document;
        },
        [documentDrives, isAllowedToEditDocuments, server],
    );

    const addFile = useCallback(
        async (
            file: string | File,
            drive: string,
            name?: string,
            parentFolder?: string,
        ) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to create files');
            }
            const document = await loadFile(file, getDocumentModel);

            // first create the file with the initial state of document
            const initialDocument: Document = {
                ...document.initialState,
                initialState: document.initialState,
                operations: {
                    global: [],
                    local: [],
                },
                clipboard: [],
            };
            const fileNode = await addDocument(
                drive,
                name || (typeof file === 'string' ? document.name : file.name),
                document.documentType,
                parentFolder,
                initialDocument,
            );

            // then add all the operations
            const operationsLimit = FILE_UPLOAD_OPERATIONS_CHUNK_SIZE;
            for (const operations of Object.values(document.operations)) {
                for (let i = 0; i < operations.length; i += operationsLimit) {
                    const chunk = operations.slice(i, i + operationsLimit);
                    const operation = chunk.at(-1);
                    if (!operation) {
                        break;
                    }
                    const { scope } = operation;

                    await addOperations(drive, fileNode.id, chunk);
                    await new Promise<void>(resolve =>
                        server.on('strandUpdate', update => {
                            const sameScope =
                                update.documentId === fileNode.id &&
                                update.scope == scope;
                            if (!sameScope) {
                                return;
                            }

                            // if all pushed operations are found in the strand
                            // update then moves on to the next chunk
                            const operationNotFound = chunk.find(
                                op =>
                                    !update.operations.find(strandOp =>
                                        op.id
                                            ? op.id === strandOp.id
                                            : op.index === strandOp.index &&
                                              op.hash === strandOp.hash,
                                    ),
                            );
                            if (!operationNotFound) {
                                resolve();
                            }
                        }),
                    );
                }
            }
        },
        [
            addDocument,
            addOperations,
            getDocumentModel,
            isAllowedToCreateDocuments,
            server,
        ],
    );

    const updateFile = useCallback(
        async (
            driveId: string,
            id: string,
            documentType?: string,
            name?: string,
            parentFolder?: string,
        ) => {
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
        },
        [_addDriveOperation, isAllowedToCreateDocuments],
    );

    const addFolder = useCallback(
        async (driveId: string, name: string, parentFolder?: string) => {
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
        },
        [_addDriveOperation, isAllowedToCreateDocuments],
    );

    const deleteNode = useCallback(
        async (drive: string, id: string) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to delete documents');
            }
            await _addDriveOperation(
                drive,
                actions.deleteNode({
                    id,
                }),
            );
        },
        [_addDriveOperation, isAllowedToCreateDocuments],
    );

    const renameNode = useCallback(
        async (driveId: string, id: string, name: string) => {
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
        },
        [_addDriveOperation, isAllowedToCreateDocuments],
    );

    const moveNode = useCallback(
        async (src: UiNode, target: UiNode) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to move documents');
            }

            if (target.kind === FILE || src.parentFolder === target.id) return;

            await _addDriveOperation(
                target.driveId,
                actions.moveNode({
                    srcFolder: src.id,
                    targetParentFolder: target.id,
                }),
            );
        },
        [_addDriveOperation, isAllowedToCreateDocuments],
    );

    const copyNode = useCallback(
        async (src: UiNode, target: UiNode) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to copy documents');
            }

            if (target.kind === FILE) return;

            const drive = documentDrives.find(
                drive => drive.state.global.id === src.driveId,
            );

            if (!drive) return;

            const generateId = () => utils.hashKey();

            const copyNodesInput = documentDriveUtils.generateNodesCopy(
                {
                    srcId: src.id,
                    targetParentFolder: target.id,
                    targetName: src.name,
                },
                generateId,
                drive.state.global.nodes,
            );

            const copyActions = copyNodesInput.map(copyNodeInput =>
                actions.copyNode(copyNodeInput),
            );

            const result = await server.addDriveActions(
                src.driveId,
                copyActions,
            );
            if (result.operations.length) {
                await refreshDocumentDrives();
            } else if (result.status !== 'SUCCESS') {
                logger.error(
                    `Error copying files: ${result.status}`,
                    result.error,
                );
            }
        },
        [
            documentDrives,
            isAllowedToCreateDocuments,
            refreshDocumentDrives,
            server,
        ],
    );

    const addOperation = useCallback(
        async (driveId: string, id: string, operation: Operation) => {
            if (!isAllowedToEditDocuments) {
                throw new Error('User is not allowed to edit documents');
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

            const newDocument = await server.addOperation(
                driveId,
                id,
                operation,
            );
            return newDocument.document;
        },
        [documentDrives, isAllowedToEditDocuments, server],
    );

    const addDrive = useCallback(
        async (drive: DriveInput) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to create drives');
            }
            const id = drive.global.id || utils.hashKey();
            drive = documentDriveUtils.createState(drive);
            const newDrive = await server.addDrive({
                global: { ...drive.global, id },
                local: drive.local,
            });
            await refreshDocumentDrives();
            return newDrive;
        },
        [isAllowedToCreateDocuments, refreshDocumentDrives, server],
    );

    const addRemoteDrive = useCallback(
        async (url: string, options: RemoteDriveOptions) => {
            const newDrive = await server.addRemoteDrive(url, options);
            await refreshDocumentDrives();
            return newDrive;
        },
        [refreshDocumentDrives, server],
    );

    const deleteDrive = useCallback(
        async (id: string) => {
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
        },
        [
            documentDrives,
            isAllowedToCreateDocuments,
            refreshDocumentDrives,
            server,
        ],
    );

    const renameDrive = useCallback(
        async (id: string, name: string) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to rename drives');
            }
            return _addDriveOperation(id, actions.setDriveName({ name }));
        },
        [_addDriveOperation, isAllowedToCreateDocuments],
    );

    const setDriveAvailableOffline = useCallback(
        async (id: string, availableOffline: boolean) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error(
                    'User is not allowed to change drive availability',
                );
            }
            return _addDriveOperation(
                id,
                actions.setAvailableOffline({ availableOffline }),
            );
        },
        [_addDriveOperation, isAllowedToCreateDocuments],
    );

    const setDriveSharingType = useCallback(
        async (id: string, sharingType: SharingType) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error(
                    'User is not allowed to change drive availability',
                );
            }
            return _addDriveOperation(
                id,
                actions.setSharingType({ type: sharingType }),
            );
        },
        [_addDriveOperation, isAllowedToCreateDocuments],
    );

    const getSyncStatus = useCallback(
        async (
            syncId: string,
            sharingType: SharingType,
        ): Promise<SyncStatus | undefined> => {
            if (sharingType === LOCAL) return;
            try {
                return server.getSyncStatus(syncId);
            } catch (error) {
                console.error(error);
                return ERROR;
            }
        },
        [server],
    );

    const onStrandUpdate = useCallback(
        (cb: (update: StrandUpdate) => void) => {
            return server.on('strandUpdate', cb);
        },
        [server],
    );

    const onSyncStatus = useCallback(
        (cb: (driveId: string, status: SyncStatus, error?: Error) => void) => {
            return server.on('syncStatus', cb);
        },
        [server],
    );

    const clearStorage = useCallback(async () => {
        await server.clearStorage();
        await refreshDocumentDrives();
    }, [refreshDocumentDrives, server]);

    const removeTrigger = useCallback(
        async (driveId: string, triggerId: string) => {
            const drive = await _addDriveOperation(
                driveId,
                actions.removeTrigger({ triggerId }),
            );

            const trigger = drive?.state.local.triggers.find(
                trigger => trigger.id === triggerId,
            );

            if (trigger) {
                throw new Error(
                    `There was an error removing trigger ${triggerId}`,
                );
            }
        },
        [_addDriveOperation],
    );

    const registerNewPullResponderTrigger = useCallback(
        async (
            driveId: string,
            url: string,
            options: Pick<RemoteDriveOptions, 'pullFilter' | 'pullInterval'>,
        ) => {
            const pullResponderTrigger =
                await server.registerPullResponderTrigger(
                    driveId,
                    url,
                    options,
                );

            return pullResponderTrigger;
        },
        [server],
    );

    const addTrigger = useCallback(
        async (driveId: string, trigger: Trigger) => {
            const drive = await _addDriveOperation(
                driveId,
                actions.addTrigger({ trigger }),
            );

            const newTrigger = drive?.state.local.triggers.find(
                trigger => trigger.id === trigger.id,
            );

            if (!newTrigger) {
                throw new Error(
                    `There was an error adding the trigger ${trigger.id}`,
                );
            }
        },
        [_addDriveOperation],
    );

    return useMemo(
        () => ({
            documentDrives,
            documentDrivesStatus,
            addDocument,
            openFile,
            addFile,
            updateFile,
            addFolder,
            deleteNode,
            renameNode,
            moveNode,
            copyNode,
            addOperation,
            addOperations,
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
            removeTrigger,
            addTrigger,
            registerNewPullResponderTrigger,
        }),
        [
            addDocument,
            addDrive,
            addFile,
            addFolder,
            addOperation,
            addOperations,
            addRemoteDrive,
            addTrigger,
            clearStorage,
            copyNode,
            deleteDrive,
            deleteNode,
            documentDrives,
            documentDrivesStatus,
            getSyncStatus,
            moveNode,
            onStrandUpdate,
            onSyncStatus,
            openFile,
            registerNewPullResponderTrigger,
            removeTrigger,
            renameDrive,
            renameNode,
            setDriveAvailableOffline,
            setDriveSharingType,
            updateFile,
        ],
    );
}

export type TDocumentDriveServer = ReturnType<typeof useDocumentDriveServer>;
