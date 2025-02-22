import {
    ERROR,
    FILE,
    LOCAL,
    SharingType,
    UiNode,
} from '@powerhousedao/design-system';
import { SynchronizationUnitNotFoundError } from 'document-drive';
import {
    DriveInput,
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
import { App, Document, Operation, utils } from 'document-model/document';
import { useCallback, useMemo } from 'react';
import { logger } from 'src/services/logger';
import { useGetDocumentModel } from 'src/store/document-model';
import { useUnwrappedReactor } from 'src/store/reactor';
import { useUser } from 'src/store/user';
import { uploadDocumentOperations } from 'src/utils';
import { loadFile } from 'src/utils/file';
import { addActionContext, signOperation } from 'src/utils/signature';
import { useConnectCrypto, useConnectDid } from './useConnectCrypto';
import { useDocumentDrives } from './useDocumentDrives';
import { useUserPermissions } from './useUserPermissions';

const ENABLE_SYNC_DEBUG = false;

// TODO this should be added to the document model
export interface SortOptions {
    afterNodePath?: string;
}

export function useDocumentDriveServer() {
    const debugID = `[uDDS #${Math.floor(Math.random() * 999)}]`;
    const debugLog = (...data: any[]) => {
        if (!ENABLE_SYNC_DEBUG) {
            return;
        }

        if (data.length > 0 && typeof data[0] === 'string') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            console.log(`${debugID} ${data[0]}`, ...data.slice(1));
        } else {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            console.log(debugID, ...data);
        }
    };

    const { isAllowedToCreateDocuments, isAllowedToEditDocuments } =
        useUserPermissions() || {
            isAllowedToCreateDocuments: false,
            isAllowedToEditDocuments: false,
        };
    const user = useUser() || undefined;
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();
    const reactor = useUnwrappedReactor();

    const getDocumentModel = useGetDocumentModel();

    const [documentDrives, refreshDocumentDrives, , documentDrivesStatus] =
        useDocumentDrives();

    const openFile = useCallback(
        async (drive: string, id: string) => {
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }
            const document = await reactor.getDocument(drive, id);
            if (!document) {
                throw new Error(
                    `There was an error opening file with id ${id} on drive ${drive}`,
                );
            }
            return document;
        },
        [reactor],
    );

    const _addDriveOperation = useCallback(
        async (driveId: string, action: DocumentDriveAction) => {
            if (!reactor) {
                throw new Error('Reactor is not loaded');
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
                const result = await reactor.queueDriveOperation(
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
        [
            documentDrives,
            refreshDocumentDrives,
            reactor,
            sign,
            user,
            connectDid,
        ],
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
        async (
            driveId: string,
            id: string | undefined,
            operations: Operation[],
        ) => {
            if (!isAllowedToEditDocuments) {
                throw new Error('User is not allowed to edit documents');
            }

            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            const drive = documentDrives.find(
                drive => drive.state.global.id === driveId,
            );
            if (!drive) {
                throw new Error(`Drive with id ${driveId} not found`);
            }

            const result =
                id !== undefined
                    ? await reactor.queueOperations(driveId, id, operations)
                    : await reactor.queueDriveOperations(
                          driveId,
                          operations as Operation<DocumentDriveAction>[],
                      );

            if (result.operations.length) {
                await refreshDocumentDrives();
            }
            refreshDocumentDrives().catch(logger.error);
            return result.document;
        },
        [documentDrives, isAllowedToEditDocuments, reactor],
    );

    const addFile = useCallback(
        async (
            file: string | File,
            drive: string,
            name?: string,
            parentFolder?: string,
        ) => {
            debugLog(
                `addFile(drive: ${drive}, name: ${name}, folder: ${parentFolder})`,
            );
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

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
            const driveDocument = documentDrives.find(
                documentDrive => documentDrive.state.global.id === drive,
            );
            const waitForSync =
                driveDocument && driveDocument.state.local.listeners.length > 0;

            uploadDocumentOperations(
                drive,
                fileNode.id,
                document,
                reactor,
                addOperations,
                { waitForSync },
            ).catch(error => {
                throw error;
            });
        },
        [
            addDocument,
            addOperations,
            getDocumentModel,
            isAllowedToCreateDocuments,
            reactor,
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
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }
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

            const result = await reactor.addDriveActions(
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
            reactor,
        ],
    );

    const addOperation = useCallback(
        async (driveId: string, id: string, operation: Operation) => {
            if (!isAllowedToEditDocuments) {
                throw new Error('User is not allowed to edit documents');
            }

            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            const drive = documentDrives.find(
                drive => drive.state.global.id === driveId,
            );
            if (!drive) {
                throw new Error(`Drive with id ${driveId} not found`);
            }

            const newDocument = await reactor.addOperation(
                driveId,
                id,
                operation,
            );
            return newDocument.document;
        },
        [documentDrives, isAllowedToEditDocuments, reactor],
    );

    const addDrive = useCallback(
        async (drive: DriveInput, app?: App) => {
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to create drives');
            }
            const id = drive.global.id || utils.hashKey();
            drive = documentDriveUtils.createState(drive);
            const newDrive = await reactor.addDrive(
                {
                    global: { ...drive.global, id },
                    local: drive.local,
                },
                app,
            );
            await refreshDocumentDrives();
            return newDrive;
        },
        [isAllowedToCreateDocuments, refreshDocumentDrives, reactor],
    );

    const addRemoteDrive = useCallback(
        async (url: string, options: RemoteDriveOptions) => {
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            const newDrive = await reactor.addRemoteDrive(url, options);
            await refreshDocumentDrives();
            return newDrive;
        },
        [refreshDocumentDrives, reactor],
    );

    const deleteDrive = useCallback(
        async (id: string) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to delete drives');
            }
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            const drive = documentDrives.find(
                drive => drive.state.global.id === id,
            );
            if (!drive) {
                throw new Error(`Drive with id ${id} not found`);
            }
            await reactor.deleteDrive(id);
            return refreshDocumentDrives();
        },
        [
            documentDrives,
            isAllowedToCreateDocuments,
            refreshDocumentDrives,
            reactor,
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
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }
            try {
                const syncStatus = reactor.getSyncStatus(syncId);
                if (syncStatus instanceof SynchronizationUnitNotFoundError)
                    return 'INITIAL_SYNC';
                return syncStatus;
            } catch (error) {
                console.error(error);
                return ERROR;
            }
        },
        [reactor],
    );

    const onStrandUpdate = useCallback(
        (cb: (update: StrandUpdate) => void) => {
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }
            return reactor.on('strandUpdate', cb);
        },
        [reactor],
    );

    const onSyncStatus = useCallback(
        (cb: (driveId: string, status: SyncStatus, error?: Error) => void) => {
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }
            return reactor.on('syncStatus', cb);
        },
        [reactor],
    );

    const clearStorage = useCallback(async () => {
        if (!reactor) {
            return;
        }
        await reactor.clearStorage();
        await refreshDocumentDrives();
    }, [refreshDocumentDrives, reactor]);

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
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }
            const pullResponderTrigger =
                await reactor.registerPullResponderTrigger(
                    driveId,
                    url,
                    options,
                );

            return pullResponderTrigger;
        },
        [reactor],
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
