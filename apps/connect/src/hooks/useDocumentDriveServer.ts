import { useDocumentAdminStorage, useUser } from '#store';
import {
    addActionContext,
    loadFile,
    signOperation,
    uploadDocumentOperations,
} from '#utils';
import {
    useDrives,
    useGetDocumentModelModule,
    useReactor,
} from '@powerhousedao/common';
import { ERROR, LOCAL, type SharingType } from '@powerhousedao/design-system';
import {
    type DocumentDriveAction,
    type DocumentDriveDocument,
    type DriveInput,
    PullResponderTransmitter,
    type PullResponderTrigger,
    type RemoteDriveOptions,
    type StrandUpdate,
    type SyncStatus,
    SynchronizationUnitNotFoundError,
    type Trigger,
    addFolder,
    addTrigger,
    childLogger,
    copyNode,
    createDriveState,
    deleteNode,
    documentDriveReducer,
    generateAddNodeAction,
    generateNodesCopy,
    isDocumentDrive,
    isFileNode,
    isFolderNode,
    moveNode,
    removeTrigger,
    setAvailableOffline,
    setDriveName,
    setSharingType,
    updateFile,
    updateNode,
} from 'document-drive';
import {
    type GetDocumentOptions,
    type Listener,
} from 'document-drive/server/types';
import { type Operation, type PHDocument, generateId } from 'document-model';
import { useCallback, useDebugValue, useMemo } from 'react';
import { useConnectCrypto, useConnectDid } from './useConnectCrypto.js';
import { useUserPermissions } from './useUserPermissions.js';

// TODO this should be added to the document model
export interface SortOptions {
    afterNodePath?: string;
}

export function useDocumentDriveServer() {
    useDebugValue('useDocumentDriveServer');
    const logger = childLogger([
        'useDocumentDriveServer',
        Math.floor(Math.random() * 999).toString(),
    ]);

    const { isAllowedToCreateDocuments, isAllowedToEditDocuments } =
        useUserPermissions() || {
            isAllowedToCreateDocuments: false,
            isAllowedToEditDocuments: false,
        };
    const user = useUser() || undefined;
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();
    const loadableReactor = useReactor();
    const storage = useDocumentAdminStorage();

    const getDocumentModelModule = useGetDocumentModelModule();

    const loadableDrives = useDrives();

    const openFile = useCallback(
        async (drive: string, id: string, options?: GetDocumentOptions) => {
            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }

            const reactor = loadableReactor.data;
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            const document = await reactor.getDocument(drive, id, options);
            if (!document) {
                throw new Error(
                    `There was an error opening file with id ${id} on drive ${drive}`,
                );
            }
            return document;
        },
        [loadableReactor],
    );

    const getDocumentsIds = useCallback(
        async (driveId: string) => {
            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }

            const reactor = loadableReactor.data;
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            const ids = await reactor.getDocuments(driveId);
            return ids;
        },
        [loadableReactor],
    );

    const _addDriveOperation = useCallback(
        async (driveId: string, action: DocumentDriveAction) => {
            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }
            const reactor = loadableReactor.data;
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }
            if (loadableDrives.state !== 'hasData') {
                throw new Error('Drives are not loaded');
            }
            const drives = loadableDrives.data ?? [];
            let drive = drives.find(drive => drive.id === driveId);
            if (!drive) {
                throw new Error(`Drive with id ${driveId} not found`);
            }

            const driveCopy = { ...drive };

            drive = documentDriveReducer(
                drive,
                addActionContext(action, connectDid, user),
            );
            const scope = action.scope ?? 'global';
            const operations = drive.operations[scope];
            const operation = operations.findLast(
                op => op.type === action.type,
            );
            if (!operation) {
                throw new Error('There was an error applying the operation');
            }

            // sign operation
            const signedOperation = await signOperation<DocumentDriveDocument>(
                operation,
                sign,
                driveId,
                driveCopy,
                documentDriveReducer,
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
                    // await refreshDocumentDrives();
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
        [loadableDrives, loadableReactor, sign, user, connectDid],
    );

    const addDocument = useCallback(
        async (
            driveId: string,
            name: string,
            documentType: string,
            parentFolder?: string,
            document?: PHDocument,
        ) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to create documents');
            }

            if (loadableDrives.state !== 'hasData') {
                throw new Error('Drives are not loaded');
            }
            const drives = loadableDrives.data ?? [];
            let drive = drives.find(d => d.id === driveId);
            if (!drive) {
                throw new Error(`Drive with id ${driveId} not found`);
            }

            const documentId = generateId();
            const action = generateAddNodeAction(
                drive.state.global,
                {
                    id: documentId,
                    name,
                    parentFolder: parentFolder ?? null,
                    documentType,
                    document,
                },
                ['global'],
            );

            drive = await _addDriveOperation(driveId, action);

            const node = drive?.state.global.nodes.find(
                node => node.id === documentId,
            );
            if (!node || !isFileNode(node)) {
                throw new Error('There was an error adding document');
            }

            return node;
        },
        [_addDriveOperation, loadableDrives, isAllowedToCreateDocuments],
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

            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }
            const reactor = loadableReactor.data;
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }
            if (loadableDrives.state !== 'hasData') {
                throw new Error('Drives are not loaded');
            }
            const drives = loadableDrives.data ?? [];
            const drive = drives.find(drive => drive.id === driveId);
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
                // await refreshDocumentDrives();
            }
            // refreshDocumentDrives().catch(logger.error);
            return result.document;
        },
        [loadableDrives, isAllowedToEditDocuments, loadableReactor],
    );

    const addFile = useCallback(
        async (
            file: string | File,
            drive: string,
            name?: string,
            parentFolder?: string,
        ) => {
            logger.verbose(
                `addFile(drive: ${drive}, name: ${name}, folder: ${parentFolder})`,
            );
            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }
            const reactor = loadableReactor.data;
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to create files');
            }
            const document = await loadFile(file, getDocumentModelModule);

            // first create the file with the initial state of document
            const initialDocument: PHDocument = {
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

            if (loadableDrives.state !== 'hasData') {
                throw new Error('Drives are not loaded');
            }
            const drives = loadableDrives.data ?? [];
            const driveDocument = drives.find(
                documentDrive => documentDrive.id === drive,
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

            return fileNode;
        },
        [
            addDocument,
            addOperations,
            getDocumentModelModule,
            isAllowedToCreateDocuments,
            loadableReactor,
        ],
    );

    const handleUpdateFile = useCallback(
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
                updateFile({
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

    const handleAddFolder = useCallback(
        async (driveId: string, name: string, parentFolder?: string) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to create folders');
            }
            const folderId = generateId();
            const drive = await _addDriveOperation(
                driveId,
                addFolder({
                    id: folderId,
                    name,
                    parentFolder,
                }),
            );

            const node = drive?.state.global.nodes.find(
                node => node.id === folderId,
            );
            if (!node || !isFolderNode(node)) {
                throw new Error('There was an error adding folder');
            }
            return node;
        },
        [_addDriveOperation, isAllowedToCreateDocuments],
    );

    const handleDeleteNode = useCallback(
        async (drive: string, id: string) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to delete documents');
            }
            await _addDriveOperation(
                drive,
                deleteNode({
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
                updateNode({
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

    const handleMoveNode = useCallback(
        async (srcNodeId: string, targetNodeId: string, driveId: string) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to move documents');
            }

            await _addDriveOperation(
                driveId,
                moveNode({
                    srcFolder: srcNodeId,
                    targetParentFolder: targetNodeId,
                }),
            );
        },
        [_addDriveOperation, isAllowedToCreateDocuments],
    );

    const handleCopyNode = useCallback(
        async (srcNodeId: string, targetNodeId: string, driveId: string) => {
            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }
            const reactor = loadableReactor.data;
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to copy documents');
            }

            if (loadableDrives.state !== 'hasData') {
                throw new Error('Drives are not loaded');
            }
            const drives = loadableDrives.data ?? [];
            const drive = drives.find(drive => drive.id === driveId);
            if (!drive) {
                throw new Error(`Drive with id ${driveId} not found`);
            }

            const copyNodesInput = generateNodesCopy(
                {
                    srcId: srcNodeId,
                    targetParentFolder: targetNodeId,
                    targetName: srcNodeId,
                },
                () => generateId(),
                drive.state.global.nodes,
            );

            const copyActions = copyNodesInput.map(copyNodeInput =>
                copyNode(copyNodeInput),
            );

            const result = await reactor.addDriveActions(driveId, copyActions);
            if (result.operations.length) {
                // await refreshDocumentDrives();
            } else if (result.status !== 'SUCCESS') {
                logger.error(
                    `Error copying files: ${result.status}`,
                    result.error,
                );
            }
        },
        [loadableDrives, isAllowedToCreateDocuments, loadableReactor],
    );

    const addOperation = useCallback(
        async (driveId: string, id: string, operation: Operation) => {
            if (!isAllowedToEditDocuments) {
                throw new Error('User is not allowed to edit documents');
            }

            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }
            const reactor = loadableReactor.data;
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            if (loadableDrives.state !== 'hasData') {
                throw new Error('Drives are not loaded');
            }
            const drives = loadableDrives.data ?? [];
            const drive = drives.find(drive => drive.id === driveId);
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
        [loadableDrives, isAllowedToEditDocuments, loadableReactor],
    );

    const addDrive = useCallback(
        async (drive: DriveInput, preferredEditor?: string) => {
            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }
            const reactor = loadableReactor.data;
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to create drives');
            }
            const id = drive.id || generateId();
            drive = createDriveState(drive);
            const newDrive = await reactor.addDrive(
                {
                    global: drive.global,
                    local: drive.local,
                    id,
                },
                preferredEditor,
            );
            // await refreshDocumentDrives();
            return newDrive;
        },
        [isAllowedToCreateDocuments, loadableReactor],
    );

    const addRemoteDrive = useCallback(
        async (url: string, options: RemoteDriveOptions) => {
            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }
            const reactor = loadableReactor.data;
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            const newDrive = await reactor.addRemoteDrive(url, options);
            // await refreshDocumentDrives();
            return newDrive;
        },
        [loadableReactor],
    );

    const deleteDrive = useCallback(
        async (id: string) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to delete drives');
            }
            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }
            const reactor = loadableReactor.data;
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            if (loadableDrives.state !== 'hasData') {
                throw new Error('Drives are not loaded');
            }
            const drives = loadableDrives.data ?? [];
            const drive = drives.find(drive => drive.id === id);
            if (!drive) {
                throw new Error(`Drive with id ${id} not found`);
            }
            await reactor.deleteDrive(id);
            // return refreshDocumentDrives();
        },
        [loadableDrives, isAllowedToCreateDocuments, loadableReactor],
    );

    const renameDrive = useCallback(
        async (id: string, name: string) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to rename drives');
            }
            return _addDriveOperation(id, setDriveName({ name }));
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
                setAvailableOffline({ availableOffline }),
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
                setSharingType({ type: sharingType }),
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
            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }
            const reactor = loadableReactor.data;
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
        [loadableReactor],
    );

    const getSyncStatusSync = useCallback(
        (syncId: string, sharingType: SharingType): SyncStatus | undefined => {
            if (sharingType === LOCAL) return;
            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }
            const reactor = loadableReactor.data;
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
        [loadableReactor],
    );

    const onStrandUpdate = useCallback(
        (cb: (update: StrandUpdate) => void) => {
            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }
            const reactor = loadableReactor.data;
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }
            return reactor.on('strandUpdate', cb);
        },
        [loadableReactor],
    );

    const onSyncStatus = useCallback(
        (cb: (driveId: string, status: SyncStatus, error?: Error) => void) => {
            const emptyUnsub = () => {};
            if (loadableReactor.state !== 'hasData') {
                return emptyUnsub;
            }
            const reactor = loadableReactor.data;
            if (!reactor) {
                return emptyUnsub;
            }
            return reactor.on('syncStatus', cb);
        },
        [loadableReactor],
    );

    const clearStorage = useCallback(async () => {
        // reactor may have not loaded yet
        if (loadableReactor.state !== 'hasData') {
            return;
        }

        await storage.clear();
    }, [loadableReactor, storage]);

    const handleRemoveTrigger = useCallback(
        async (driveId: string, triggerId: string) => {
            const drive = await _addDriveOperation(
                driveId,
                removeTrigger({ triggerId }),
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
        ): Promise<PullResponderTrigger> => {
            if (loadableReactor.state !== 'hasData') {
                throw new Error('Reactor is not loaded');
            }
            const reactor = loadableReactor.data;
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            const uuid = generateId();
            const listener: Listener = {
                driveId,
                listenerId: uuid,
                block: false,
                filter: {
                    branch: options.pullFilter?.branch ?? [],
                    documentId: options.pullFilter?.documentId ?? [],
                    documentType: options.pullFilter?.documentType ?? [],
                    scope: options.pullFilter?.scope ?? [],
                },
                system: false,
                label: `Pullresponder #${uuid}`,
                callInfo: {
                    data: '',
                    name: 'PullResponder',
                    transmitterType: 'PullResponder',
                },
            };

            // TODO: circular reference
            // TODO: once we have DI, remove this and pass around
            const listenerManager = reactor.listeners;
            listener.transmitter = new PullResponderTransmitter(
                listener,
                listenerManager,
            );

            // set the listener on the manager directly (bypassing operations)
            try {
                await listenerManager.setListener(driveId, listener);
            } catch (error) {
                throw new Error(`Listener couldn't be registered: ${error}`);
            }

            // for backwards compatibility: return everything but the transmitter
            return {
                driveId,
                filter: listener.filter,
                data: {
                    interval: `${options.pullInterval}` || '1000',
                    listenerId: uuid,
                    url,
                },
                id: uuid,
                type: 'PullResponder',
            };
        },
        [loadableReactor],
    );

    const handleAddTrigger = useCallback(
        async (driveId: string, trigger: Trigger) => {
            const drive = await _addDriveOperation(
                driveId,
                addTrigger({ trigger }),
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
            addDocument,
            openFile,
            addFile,
            updateFile: handleUpdateFile,
            addFolder: handleAddFolder,
            deleteNode: handleDeleteNode,
            renameNode,
            moveNode: handleMoveNode,
            copyNode: handleCopyNode,
            addOperation,
            addOperations,
            addDrive,
            addRemoteDrive,
            deleteDrive,
            renameDrive,
            setDriveAvailableOffline,
            setDriveSharingType,
            getSyncStatus,
            getSyncStatusSync,
            onStrandUpdate,
            onSyncStatus,
            clearStorage,
            removeTrigger: handleRemoveTrigger,
            addTrigger: handleAddTrigger,
            registerNewPullResponderTrigger,
            getDocumentsIds,
        }),
        [
            addDocument,
            addDrive,
            addFile,
            handleAddFolder,
            addOperation,
            addOperations,
            addRemoteDrive,
            handleAddTrigger,
            clearStorage,
            handleCopyNode,
            deleteDrive,
            handleDeleteNode,
            getSyncStatus,
            getSyncStatusSync,
            handleMoveNode,
            onStrandUpdate,
            onSyncStatus,
            openFile,
            registerNewPullResponderTrigger,
            handleRemoveTrigger,
            renameDrive,
            renameNode,
            setDriveAvailableOffline,
            setDriveSharingType,
            handleUpdateFile,
            getDocumentsIds,
        ],
    );
}

export type TDocumentDriveServer = ReturnType<typeof useDocumentDriveServer>;
