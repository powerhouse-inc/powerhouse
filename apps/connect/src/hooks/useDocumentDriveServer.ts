import {
    useDocumentAdminStorage,
    useGetDocumentModelModule,
    useUser,
} from '#store';
import {
    addActionContext,
    loadFile,
    signOperation,
    uploadDocumentOperations,
} from '#utils';
import { ERROR, LOCAL, type SharingType } from '@powerhousedao/design-system';
import { useDrives, useReactor, useSelectedDrive } from '@powerhousedao/state';
import {
    type DocumentDriveAction,
    type DocumentDriveDocument,
    type DriveInput,
    type Node,
    PullResponderTransmitter,
    type PullResponderTrigger,
    type RemoteDriveOptions,
    type SyncStatus,
    SynchronizationUnitNotFoundError,
    type Trigger,
    addFile as baseAddFile,
    addFolder as baseAddFolder,
    addTrigger as baseAddTrigger,
    copyNode as baseCopyNode,
    deleteNode as baseDeleteNode,
    moveNode as baseMoveNode,
    removeTrigger as baseRemoveTrigger,
    updateFile as baseUpdateFile,
    childLogger,
    createDriveState,
    documentDriveReducer,
    generateNodesCopy,
    isFileNode,
    isFolderNode,
    setAvailableOffline,
    setDriveName,
    setSharingType,
    updateNode,
} from 'document-drive';
import {
    type GetDocumentOptions,
    type IOperationResult,
    type Listener,
} from 'document-drive/server/types';
import {
    type Operation,
    type PHDocument,
    createPresignedHeader,
    generateId,
} from 'document-model';
import { useCallback, useMemo } from 'react';
import { useConnectCrypto, useConnectDid } from './useConnectCrypto.js';
import { useUserPermissions } from './useUserPermissions.js';

function groupOperationsByScope(
    operations: Operation[],
): Map<string, Operation[]> {
    const groupedOperations = new Map<string, Operation[]>();
    for (const operation of operations) {
        const scope = operation.action.scope;
        const scopeOperations =
            groupedOperations.get(scope) ?? new Array<Operation>();
        scopeOperations.push(operation);
        groupedOperations.set(scope, scopeOperations);
    }
    return groupedOperations;
}

function deduplicateOperationsByScope(
    operationsByScope: Map<string, Operation[]>,
): Map<string, Operation[]> {
    const deduplicatedOperationsByScope = new Map<string, Operation[]>();
    for (const [scope, operations] of operationsByScope) {
        const deduplicatedOperations =
            deduplicatedOperationsByScope.get(scope) ?? new Array<Operation>();

        for (const operation of operations) {
            const duplicateOperation = deduplicatedOperations.find(
                op => op.index === operation.index,
            );
            if (duplicateOperation) {
                if (
                    duplicateOperation.action.type === operation.action.type &&
                    JSON.stringify(duplicateOperation.action.input) ===
                        JSON.stringify(operation.action.input)
                ) {
                    console.warn(
                        `skipping duplicate operations with index '${operation.index}'`,
                        duplicateOperation,
                        operation,
                    );
                } else {
                    console.warn(
                        `skipping duplicate operations with index '${operation.index}' but different actions`,
                        duplicateOperation,
                        operation,
                    );
                }
                continue;
            }
            deduplicatedOperations.push(operation);
        }
        deduplicatedOperationsByScope.set(scope, deduplicatedOperations);
    }
    return deduplicatedOperationsByScope;
}

export function useDocumentDriveServer() {
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
    const reactor = useReactor();
    const storage = useDocumentAdminStorage();
    const getDocumentModelModule = useGetDocumentModelModule();
    const drives = useDrives();
    const selectedDrive = useSelectedDrive();

    const openFile = useCallback(
        async (id: string, options?: GetDocumentOptions) => {
            if (!reactor) {
                return;
            }
            const document = await reactor.getDocument(id, options);
            return document;
        },
        [reactor],
    );

    const addDriveOperation = useCallback(
        async (driveId: string, operationToAdd: Operation) => {
            if (!reactor) {
                return;
            }

            const oldDrive = drives?.find(drive => drive.header.id === driveId);
            if (!oldDrive) {
                return;
            }

            const actionWithContext = addActionContext(
                operationToAdd.action,
                connectDid,
                user,
            );
            const operation: Operation = {
                ...operationToAdd,
                action: {
                    ...operationToAdd.action,
                    context: {
                        ...operationToAdd.action.context,
                        ...actionWithContext.context,
                    },
                },
            };

            const driveCopy = { ...oldDrive };

            // sign operation
            const signedOperation = await signOperation(
                operation,
                sign,
                driveId,
                driveCopy,
                documentDriveReducer,
                user,
            );

            try {
                const result = await reactor.queueOperation(
                    driveId,
                    signedOperation,
                );

                if (result.status !== 'SUCCESS') {
                    logger.error(result.error);
                }

                return result.document as DocumentDriveDocument;
            } catch (error) {
                logger.error(error);
                return oldDrive;
            }
        },
        [reactor, drives, sign, user, connectDid],
    );

    const addDriveAction = useCallback(
        async (driveId: string, action: DocumentDriveAction) => {
            if (!reactor) {
                return;
            }

            const oldDrive = drives?.find(drive => drive.header.id === driveId);
            if (!oldDrive) {
                return;
            }

            const driveCopy = { ...oldDrive };

            const newDrive = documentDriveReducer(oldDrive, action);
            const scope = action.scope;
            const operations = newDrive.operations[scope];
            const operation = operations.findLast(
                op => op.action.type === action.type,
            );
            if (!operation) {
                throw new Error('There was an error applying the action');
            }

            // sign operation
            const signedOperation = await signOperation(
                operation,
                sign,
                driveId,
                driveCopy,
                documentDriveReducer,
                user,
            );

            return addDriveOperation(driveId, signedOperation);
        },
        [reactor, drives, sign, user, connectDid, addDriveOperation],
    );

    const addDocumentOperations = useCallback(
        async (documentId: string, operationsToAdd: Operation[]) => {
            if (!reactor) {
                return;
            }

            const operationsPerScope = groupOperationsByScope(operationsToAdd);
            const deduplicatedOperationsPerScope =
                deduplicateOperationsByScope(operationsPerScope);

            let result: IOperationResult | undefined;
            for (const operations of deduplicatedOperationsPerScope.values()) {
                result = await reactor.queueOperations(documentId, operations);
                if (result.status !== 'SUCCESS') {
                    break;
                }
            }
            if (result?.status !== 'SUCCESS') {
                logger.error(result?.error);
            }
            return result?.document;
        },
        [reactor],
    );

    const addDocument = useCallback(
        async (
            driveId: string,
            name: string,
            documentType: string,
            parentFolder?: string,
            document?: PHDocument,
            id?: string,
        ) => {
            if (!reactor) {
                throw new Error('Reactor is not loaded');
            }

            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to create documents');
            }

            const oldDrive = drives?.find(d => d.header.id === driveId);
            if (!oldDrive) {
                return;
            }

            const documentId = id ?? generateId();
            const documentModelModule = getDocumentModelModule(documentType);
            if (!documentModelModule) {
                throw new Error(
                    `Document model module for type ${documentType} not found`,
                );
            }

            const newDocument = documentModelModule.utils.createDocument({
                ...document,
            });
            newDocument.header = createPresignedHeader(
                documentId,
                documentType,
            );
            newDocument.header.name = name;

            await reactor.addDocument(newDocument);

            const action = baseAddFile({
                id: documentId,
                name,
                documentType,
                parentFolder: parentFolder ?? null,
            });

            const newDrive = await addDriveAction(driveId, action);

            const node = newDrive?.state.global.nodes.find(
                node => node.id === documentId,
            );
            if (!node || !isFileNode(node)) {
                throw new Error('There was an error adding document');
            }

            return node;
        },
        [addDriveOperation, drives, isAllowedToCreateDocuments],
    );

    const addFile = useCallback(
        async (
            file: string | File,
            driveId: string,
            name?: string,
            parentFolder?: string,
        ) => {
            logger.verbose(
                `addFile(drive: ${driveId}, name: ${name}, folder: ${parentFolder})`,
            );
            if (!reactor) {
                return;
            }

            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to create files');
            }
            const document = await loadFile(file, getDocumentModelModule);

            // first create the file with the initial state of document
            const initialDocument: PHDocument = {
                header: document.header,
                history: document.history,
                initialState: document.initialState,
                state: document.initialState.state,
                operations: {
                    global: [],
                    local: [],
                },
                clipboard: [],
            };
            const fileNode = await addDocument(
                driveId,
                name ||
                    (typeof file === 'string'
                        ? document.header.name
                        : file.name),
                document.header.documentType,
                parentFolder,
                initialDocument,
            );

            if (!fileNode) {
                throw new Error('There was an error adding file');
            }

            // then add all the operations
            const driveDocument = drives?.find(
                drive => drive.header.id === driveId,
            );
            const waitForSync =
                driveDocument && driveDocument.state.local.listeners.length > 0;

            uploadDocumentOperations(
                fileNode.id,
                document,
                addDocumentOperations,
                { waitForSync },
            ).catch(error => {
                throw error;
            });
        },
        [
            addDocument,
            addDocumentOperations,
            getDocumentModelModule,
            drives,
            isAllowedToCreateDocuments,
            reactor,
        ],
    );

    const updateFile = useCallback(
        async (
            driveId: string,
            nodeId: string,
            documentType?: string,
            name?: string,
            parentFolder?: string,
        ) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to update files');
            }
            const drive = await addDriveAction(
                driveId,
                baseUpdateFile({
                    id: nodeId,
                    name: name || undefined,
                    parentFolder,
                    documentType,
                }),
            );

            const node = drive?.state.global.nodes.find(
                node => node.id === nodeId,
            );
            if (!node || !isFileNode(node)) {
                throw new Error('There was an error updating document');
            }
            return node;
        },
        [addDriveOperation, isAllowedToCreateDocuments],
    );

    const addFolder = useCallback(
        async (driveId: string, name: string, parentFolder?: string) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to create folders');
            }
            const folderId = generateId();
            const drive = await addDriveAction(
                driveId,
                baseAddFolder({
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
        [addDriveOperation, isAllowedToCreateDocuments],
    );

    const deleteNode = useCallback(
        async (driveId: string, nodeId: string) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to delete documents');
            }
            await addDriveAction(
                driveId,
                baseDeleteNode({
                    id: nodeId,
                }),
            );
        },
        [addDriveOperation, isAllowedToCreateDocuments],
    );

    const renameNode = useCallback(
        async (
            driveId: string,
            nodeId: string,
            name: string,
        ): Promise<Node | undefined> => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to rename documents');
            }
            const drive = await addDriveAction(
                driveId,
                updateNode({
                    id: nodeId,
                    name,
                }),
            );

            const node = drive?.state.global.nodes.find(
                node => node.id === nodeId,
            );
            if (!node) {
                throw new Error('There was an error renaming node');
            }
            return node;
        },
        [addDriveOperation, isAllowedToCreateDocuments],
    );

    const moveNode = useCallback(
        async (src: Node, target: Node | undefined) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to move documents');
            }
            if (!selectedDrive?.header.id) return;

            await addDriveAction(
                selectedDrive.header.id,
                baseMoveNode({
                    srcFolder: src.id,
                    targetParentFolder: target?.id,
                }),
            );
        },
        [
            addDriveOperation,
            isAllowedToCreateDocuments,
            selectedDrive?.header.id,
        ],
    );

    const copyNode = useCallback(
        async (src: Node, target: Node | undefined) => {
            if (!reactor) {
                return;
            }
            if (!selectedDrive) {
                return;
            }
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to copy documents');
            }

            const copyNodesInput = generateNodesCopy(
                {
                    srcId: src.id,
                    targetParentFolder: target?.id,
                    targetName: src.name,
                },
                () => generateId(),
                selectedDrive.state.global.nodes,
            );

            const copyActions = copyNodesInput.map(copyNodeInput =>
                baseCopyNode(copyNodeInput),
            );
            const result = await reactor.addActions(
                selectedDrive.header.id,
                copyActions,
            );

            if (result.status !== 'SUCCESS') {
                logger.error(
                    `Error copying files: ${result.status}`,
                    result.error,
                );
            }

            return result.document as DocumentDriveDocument;
        },
        [isAllowedToCreateDocuments, reactor, selectedDrive],
    );

    const addDrive = useCallback(
        async (drive: DriveInput, preferredEditor?: string) => {
            if (!reactor) {
                return;
            }

            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to create drives');
            }
            const id = drive.id || generateId();
            const driveInput = createDriveState(drive);
            const newDrive = await reactor.addDrive(
                {
                    global: driveInput.global,
                    local: driveInput.local,
                    id,
                },
                preferredEditor,
            );
            return newDrive;
        },
        [isAllowedToCreateDocuments, reactor],
    );

    const addRemoteDrive = useCallback(
        async (url: string, options: RemoteDriveOptions) => {
            if (!reactor) {
                return;
            }

            const newDrive = await reactor.addRemoteDrive(url, options);
            return newDrive;
        },
        [isAllowedToCreateDocuments, reactor],
    );

    const deleteDrive = useCallback(
        async (driveId: string) => {
            if (!reactor) {
                return;
            }
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to delete drives');
            }
            await reactor.deleteDrive(driveId);
        },
        [isAllowedToCreateDocuments, reactor],
    );

    const renameDrive = useCallback(
        async (driveId: string, name: string) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error('User is not allowed to rename drives');
            }
            const renamedDrive = await addDriveAction(
                driveId,
                setDriveName({ name }),
            );
            return renamedDrive;
        },
        [addDriveOperation, isAllowedToCreateDocuments],
    );

    const setDriveAvailableOffline = useCallback(
        async (driveId: string, availableOffline: boolean) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error(
                    'User is not allowed to change drive availability',
                );
            }
            const updatedDrive = await addDriveAction(
                driveId,
                setAvailableOffline({ availableOffline }),
            );
            return updatedDrive;
        },
        [addDriveOperation, isAllowedToCreateDocuments],
    );

    const setDriveSharingType = useCallback(
        async (driveId: string, sharingType: SharingType) => {
            if (!isAllowedToCreateDocuments) {
                throw new Error(
                    'User is not allowed to change drive availability',
                );
            }
            const updatedDrive = await addDriveAction(
                driveId,
                setSharingType({ type: sharingType }),
            );
            return updatedDrive;
        },
        [addDriveOperation, isAllowedToCreateDocuments],
    );

    const getSyncStatus = useCallback(
        async (
            documentId: string,
            sharingType: SharingType,
        ): Promise<SyncStatus | undefined> => {
            if (sharingType === LOCAL) return;
            if (!reactor) {
                return;
            }
            try {
                const syncStatus = reactor.getSyncStatus(documentId);
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

    const getSyncStatusSync = useCallback(
        (
            documentId: string,
            sharingType: SharingType,
        ): SyncStatus | undefined => {
            if (sharingType === LOCAL) return;
            if (!reactor) {
                return;
            }
            try {
                const syncStatus = reactor.getSyncStatus(documentId);
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

    const clearStorage = useCallback(async () => {
        // reactor may have not loaded yet
        if (!reactor) {
            return;
        }

        await storage.clear();
    }, [reactor, storage]);

    const removeTrigger = useCallback(
        async (driveId: string, triggerId: string) => {
            const drive = await addDriveAction(
                driveId,
                baseRemoveTrigger({ triggerId }),
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
        [addDriveOperation],
    );

    const registerNewPullResponderTrigger = useCallback(
        async (
            driveId: string,
            url: string,
            options: Pick<RemoteDriveOptions, 'pullFilter' | 'pullInterval'>,
        ): Promise<PullResponderTrigger | undefined> => {
            if (!reactor) {
                return;
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
        [reactor],
    );

    const addTrigger = useCallback(
        async (driveId: string, trigger: Trigger) => {
            const drive = await addDriveAction(
                driveId,
                baseAddTrigger({ trigger }),
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
        [addDriveOperation],
    );

    return useMemo(
        () => ({
            addDocument,
            addDocumentOperations,
            addDriveOperation,
            addFile,
            addFolder,
            openFile,
            updateFile,
            deleteNode,
            renameNode,
            moveNode,
            copyNode,
            addDrive,
            addRemoteDrive,
            deleteDrive,
            renameDrive,
            setDriveAvailableOffline,
            setDriveSharingType,
            getSyncStatus,
            getSyncStatusSync,
            clearStorage,
            removeTrigger,
            addTrigger,
            registerNewPullResponderTrigger,
        }),
        [
            addDocument,
            addDocumentOperations,
            addDriveOperation,
            addFile,
            addFolder,
            openFile,
            updateFile,
            deleteNode,
            renameNode,
            moveNode,
            copyNode,
            addDrive,
            addRemoteDrive,
            deleteDrive,
            renameDrive,
            setDriveAvailableOffline,
            setDriveSharingType,
            getSyncStatus,
            getSyncStatusSync,
            clearStorage,
            removeTrigger,
            addTrigger,
            registerNewPullResponderTrigger,
        ],
    );
}

export type TDocumentDriveServer = ReturnType<typeof useDocumentDriveServer>;
