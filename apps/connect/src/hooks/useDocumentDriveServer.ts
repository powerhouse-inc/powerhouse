import { useUser } from '#store';
import {
    addActionContext,
    loadFile,
    signOperation,
    uploadDocumentOperations,
} from '#utils';
import { ERROR, LOCAL, type SharingType } from '@powerhousedao/design-system';
import { useReactor } from '@powerhousedao/state';
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
    type Listener,
} from 'document-drive/server/types';
import {
    type Operation,
    type PHDocument,
    createPresignedHeader,
    generateId,
} from 'document-model';
import { useConnectCrypto, useConnectDid } from './useConnectCrypto.js';
import { useUserPermissions } from './useUserPermissions.js';

function deduplicateOperations(
    existingOperations: Record<string, Operation[]>,
    operationsToDeduplicate: Operation[],
) {
    // make a set of all the operation indices for each scope to avoid duplicates
    const operationIndicesByScope = {} as Record<string, Set<number>>;
    for (const scope of Object.keys(existingOperations)) {
        operationIndicesByScope[scope] = new Set(
            existingOperations[scope].map(op => op.index),
        );
    }

    const newOperations: Operation[] = [];

    for (const operation of operationsToDeduplicate) {
        const scope = operation.scope;
        const index = operation.index;
        if (operationIndicesByScope[scope].has(index)) {
            const duplicatedExistingOperation = existingOperations[scope].find(
                op => op.index === index,
            );
            const duplicatedNewOperation = newOperations.find(
                op => op.index === index,
            );
            console.warn('skipping duplicate operation');
            if (duplicatedExistingOperation) {
                console.warn(
                    'duplicate existing operation',
                    duplicatedExistingOperation,
                );
            }
            if (duplicatedNewOperation) {
                console.warn('duplicate new operation', duplicatedNewOperation);
            }
            continue;
        }
        newOperations.push(operation);
        operationIndicesByScope[scope].add(index);
    }

    const uniqueOperationIds = new Set<string>();
    const operationsDedupedById: Operation[] = [];

    for (const [scope, operations] of Object.entries(existingOperations)) {
        for (const operation of operations) {
            const id = operation.id;
            if (!id) {
                console.warn('skipping operation with no id', operation);
                continue;
            }
            if (uniqueOperationIds.has(id)) {
                console.warn(
                    'skipping existing operation with duplicate id in scope',
                    scope,
                    operation,
                );
                continue;
            }
            uniqueOperationIds.add(id);
        }
    }

    for (const operation of newOperations) {
        const id = operation.id;
        if (!id) {
            console.warn('skipping operation with no id', operation);
            continue;
        }
        if (uniqueOperationIds.has(id)) {
            console.warn(
                'skipping new operation with duplicate id in scope',
                operation.scope,
                operation,
            );
            continue;
        }
        uniqueOperationIds.add(id);
        operationsDedupedById.push(operation);
    }
    return operationsDedupedById;
}

export function useDocumentDriveServer() {
    const logger = childLogger([
        'useDocumentDriveServer',
        Math.floor(Math.random() * 999).toString(),
    ]);

    const { isAllowedToCreateDocuments } = useUserPermissions() || {
        isAllowedToCreateDocuments: false,
        isAllowedToEditDocuments: false,
    };
    const user = useUser() || undefined;
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();
    const reactor = useReactor();

    const openFile = async (id: string, options?: GetDocumentOptions) => {
        if (!reactor) {
            return;
        }
        const document = await reactor.getDocument(id, options);
        return document;
    };

    const addDriveOperation = async (
        driveId: string,
        action: DocumentDriveAction,
    ) => {
        if (!reactor) {
            return;
        }

        const oldDrive = await reactor.getDrive(driveId);
        // TODO: the type for reactor.getDrive says it cannot fail, so why do we need this?
        if (!oldDrive) {
            return;
        }

        const driveCopy = { ...oldDrive };

        const newDrive = documentDriveReducer(
            oldDrive,
            addActionContext(action, connectDid, user),
        );
        const scope = action.scope;
        const operations = newDrive.operations[scope];
        const operation = operations.findLast(op => op.type === action.type);
        if (!operation) {
            throw new Error('There was an error applying the operation');
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

        try {
            const result = await reactor.queueOperation(
                driveId,
                signedOperation,
            );

            if (result.status !== 'SUCCESS') {
                logger.error(result.error);
            }

            // TODO: add validation
            // this type is a lie
            return result.document as DocumentDriveDocument;
        } catch (error) {
            logger.error(error);
            return oldDrive;
        }
    };

    // TODO: why does addDriveOperation do signing but adding multiple operations does not?
    const addDriveOperations = async (
        driveId: string,
        operationsToAdd: Operation[],
    ) => {
        if (!reactor) {
            return;
        }
        const drive = await reactor.getDrive(driveId);

        const dedupedOperations = deduplicateOperations(
            drive.operations,
            operationsToAdd,
        );

        const result = await reactor.queueOperations(
            driveId,
            dedupedOperations,
        );
        if (result.status !== 'SUCCESS') {
            logger.error(result.error);
        }
        return result.document;
    };

    const addDocumentOperations = async (
        documentId: string,
        operationsToAdd: Operation[],
    ) => {
        if (!reactor) {
            return;
        }
        const document = await reactor.getDocument(documentId);
        const newOperations = deduplicateOperations(
            document.operations,
            operationsToAdd,
        );
        const result = await reactor.queueOperations(documentId, newOperations);
        if (result.status !== 'SUCCESS') {
            logger.error(result.error);
        }
        return result.document;
    };

    const addDocument = async (
        driveId: string,
        name: string,
        documentType: string,
        parentFolder?: string,
        document?: PHDocument,
        id?: string,
        preferredEditor?: string,
    ) => {
        if (!reactor) {
            throw new Error('Reactor is not loaded');
        }

        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to create documents');
        }

        const documentId = id ?? generateId();
        const reactorDocumentModelModules = reactor.getDocumentModelModules();
        const documentModelModuleFromReactor = reactorDocumentModelModules.find(
            module => module.documentModel.id === documentType,
        );
        if (!documentModelModuleFromReactor) {
            throw new Error(
                `Document model module for type ${documentType} not found`,
            );
        }

        const newDocument = documentModelModuleFromReactor.utils.createDocument(
            {
                ...document,
            },
        );
        newDocument.header = createPresignedHeader(documentId, documentType);
        newDocument.header.name = name;

        await reactor.addDocument(newDocument, {
            preferredEditor,
        });

        const action = baseAddFile({
            id: documentId,
            name,
            documentType,
            parentFolder: parentFolder ?? null,
        });

        const newDrive = await addDriveOperation(driveId, action);

        const node = newDrive?.state.global.nodes.find(
            node => node.id === documentId,
        );
        if (!node || !isFileNode(node)) {
            throw new Error('There was an error adding document');
        }

        return node;
    };

    const addFile = async (
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
        const reactorDocumentModelModules = reactor.getDocumentModelModules();
        const document = await loadFile(file, reactorDocumentModelModules);

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
                (typeof file === 'string' ? document.header.name : file.name),
            document.header.documentType,
            parentFolder,
            initialDocument,
        );

        // TODO: the return type of addDocument says it cannot fail, so why do we need this?
        if (!fileNode) {
            throw new Error('There was an error adding file');
        }

        // then add all the operations
        const driveDocument = await reactor.getDrive(driveId);
        // TODO: the type for reactor.getDrive says it cannot fail, so why do we need this?
        const waitForSync =
            driveDocument && driveDocument.state.local.listeners.length > 0;

        uploadDocumentOperations(fileNode.id, document, addDocumentOperations, {
            waitForSync,
        }).catch(error => {
            throw error;
        });
    };

    const updateFile = async (
        driveId: string,
        nodeId: string,
        documentType?: string,
        name?: string,
        parentFolder?: string,
    ) => {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to update files');
        }
        const drive = await addDriveOperation(
            driveId,
            baseUpdateFile({
                id: nodeId,
                name: name || undefined,
                parentFolder,
                documentType,
            }),
        );

        const node = drive?.state.global.nodes.find(node => node.id === nodeId);
        if (!node || !isFileNode(node)) {
            throw new Error('There was an error updating document');
        }
        return node;
    };

    const addFolder = async (
        driveId: string,
        name: string,
        parentFolder?: string,
    ) => {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to create folders');
        }
        const folderId = generateId();
        const drive = await addDriveOperation(
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
    };

    const deleteNode = async (driveId: string, nodeId: string) => {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to delete documents');
        }
        await addDriveOperation(
            driveId,
            baseDeleteNode({
                id: nodeId,
            }),
        );
    };

    const renameNode = async (
        driveId: string,
        nodeId: string,
        name: string,
    ): Promise<Node | undefined> => {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to rename documents');
        }
        const drive = await addDriveOperation(
            driveId,
            updateNode({
                id: nodeId,
                name,
            }),
        );

        const node = drive?.state.global.nodes.find(node => node.id === nodeId);
        if (!node) {
            throw new Error('There was an error renaming node');
        }
        return node;
    };

    const moveNode = async (src: Node, target: Node | undefined) => {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to move documents');
        }
        if (!reactor) {
            throw new Error('Reactor is not loaded');
        }
        // TODO: it should not be this much work just to get the drive for a given node
        const driveIds = await reactor.getDrives();
        const drives = await Promise.all(
            driveIds.map(id => reactor.getDrive(id)),
        );
        const driveForNode = drives.find(drive =>
            drive.state.global.nodes.some(node => node.id === src.id),
        );
        if (!driveForNode) {
            throw new Error('Node is not in any drive');
        }

        await addDriveOperation(
            driveForNode.header.id,
            baseMoveNode({
                srcFolder: src.id,
                targetParentFolder: target?.id,
            }),
        );
    };

    const copyNode = async (src: Node, target: Node | undefined) => {
        if (!reactor) {
            return;
        }
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to copy documents');
        }
        // TODO: it should not be this much work just to get the drive for a given node
        const driveIds = await reactor.getDrives();
        const drives = await Promise.all(
            driveIds.map(id => reactor.getDrive(id)),
        );
        const driveForNode = drives.find(drive =>
            drive.state.global.nodes.some(node => node.id === src.id),
        );
        if (!driveForNode) {
            throw new Error('Node is not in any drive');
        }

        const copyNodesInput = generateNodesCopy(
            {
                srcId: src.id,
                targetParentFolder: target?.id,
                targetName: src.name,
            },
            () => generateId(),
            driveForNode.state.global.nodes,
        );

        const copyActions = copyNodesInput.map(copyNodeInput =>
            baseCopyNode(copyNodeInput),
        );
        const result = await reactor.addActions(
            driveForNode.header.id,
            copyActions,
        );

        if (result.status !== 'SUCCESS') {
            logger.error(`Error copying files: ${result.status}`, result.error);
        }

        // TODO: this is a lie
        return result.document as DocumentDriveDocument;
    };

    const addDrive = async (drive: DriveInput, preferredEditor?: string) => {
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
    };

    const addRemoteDrive = async (url: string, options: RemoteDriveOptions) => {
        if (!reactor) {
            return;
        }

        const newDrive = await reactor.addRemoteDrive(url, options);
        return newDrive;
    };

    const deleteDrive = async (driveId: string) => {
        if (!reactor) {
            return;
        }
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to delete drives');
        }
        await reactor.deleteDrive(driveId);
    };

    const renameDrive = async (driveId: string, name: string) => {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to rename drives');
        }
        const renamedDrive = await addDriveOperation(
            driveId,
            setDriveName({ name }),
        );
        return renamedDrive;
    };

    const setDriveAvailableOffline = async (
        driveId: string,
        availableOffline: boolean,
    ) => {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to change drive availability');
        }
        const updatedDrive = await addDriveOperation(
            driveId,
            setAvailableOffline({ availableOffline }),
        );
        return updatedDrive;
    };

    const setDriveSharingType = async (
        driveId: string,
        sharingType: SharingType,
    ) => {
        if (!isAllowedToCreateDocuments) {
            throw new Error('User is not allowed to change drive availability');
        }
        const updatedDrive = await addDriveOperation(
            driveId,
            setSharingType({ type: sharingType }),
        );
        return updatedDrive;
    };

    const getSyncStatus = async (
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
    };

    const getSyncStatusSync = (
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
    };

    const clearStorage = async () => {
        await window.phStorage?.clear();
    };

    const removeTrigger = async (driveId: string, triggerId: string) => {
        const drive = await addDriveOperation(
            driveId,
            baseRemoveTrigger({ triggerId }),
        );

        const trigger = drive?.state.local.triggers.find(
            trigger => trigger.id === triggerId,
        );

        if (trigger) {
            throw new Error(`There was an error removing trigger ${triggerId}`);
        }
    };

    const registerNewPullResponderTrigger = async (
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
    };

    const addTrigger = async (driveId: string, trigger: Trigger) => {
        const drive = await addDriveOperation(
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
    };

    return {
        addDocument,
        addDocumentOperations,
        addDriveOperation,
        addDriveOperations,
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
    };
}

export type TDocumentDriveServer = ReturnType<typeof useDocumentDriveServer>;
