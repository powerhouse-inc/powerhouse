import {
    actions,
    AddListenerInput,
    DocumentDriveAction,
    DocumentDriveDocument,
    DocumentDriveState,
    FileNode,
    isFileNode,
    ListenerFilter,
    RemoveListenerInput,
    Trigger,
    utils
} from 'document-model-libs/document-drive';
import {
    Action,
    BaseAction,
    utils as baseUtils,
    Document,
    DocumentHeader,
    DocumentModel,
    Operation,
    OperationScope
} from 'document-model/document';
import { createNanoEvents, Unsubscribe } from 'nanoevents';
import { MemoryStorage } from '../storage/memory';
import type {
    DocumentDriveStorage,
    DocumentStorage,
    IDriveStorage
} from '../storage/types';
import { generateUUID, isBefore, isDocumentDrive } from '../utils';
import {
    attachBranch,
    garbageCollect,
    groupOperationsByScope,
    merge,
    precedes,
    removeExistingOperations,
    reshuffleByTimestamp,
    sortOperations
} from '../utils/document-helpers';
import { requestPublicDrive } from '../utils/graphql';
import { logger } from '../utils/logger';
import { OperationError } from './error';
import { ListenerManager } from './listener/manager';
import {
    CancelPullLoop,
    InternalTransmitter,
    IReceiver,
    ITransmitter,
    PullResponderTransmitter
} from './listener/transmitter';
import {
    BaseDocumentDriveServer,
    DriveEvents,
    GetDocumentOptions,
    IOperationResult,
    ListenerState,
    RemoteDriveOptions,
    StrandUpdate,
    SyncStatus,
    type CreateDocumentInput,
    type DriveInput,
    type OperationUpdate,
    type SignalResult,
    type SynchronizationUnit
} from './types';
import { filterOperationsByRevision } from './utils';

export * from './listener';
export type * from './types';

export const PULL_DRIVE_INTERVAL = 5000;

export class DocumentDriveServer extends BaseDocumentDriveServer {
    private emitter = createNanoEvents<DriveEvents>();
    private documentModels: DocumentModel[];
    private storage: IDriveStorage;
    private listenerStateManager: ListenerManager;
    private triggerMap = new Map<
        DocumentDriveState['id'],
        Map<Trigger['id'], CancelPullLoop>
    >();
    private syncStatus = new Map<DocumentDriveState['id'], SyncStatus>();

    constructor(
        documentModels: DocumentModel[],
        storage: IDriveStorage = new MemoryStorage()
    ) {
        super();
        this.listenerStateManager = new ListenerManager(this);
        this.documentModels = documentModels;
        this.storage = storage;
    }

    private updateSyncStatus(
        driveId: string,
        status: SyncStatus | null,
        error?: Error
    ) {
        if (status === null) {
            this.syncStatus.delete(driveId);
        } else if (this.syncStatus.get(driveId) !== status) {
            this.syncStatus.set(driveId, status);
            this.emit('syncStatus', driveId, status, error);
        }
    }

    private async saveStrand(strand: StrandUpdate) {
        const operations: Operation[] = strand.operations.map(
            ({ index, type, hash, input, skip, timestamp }) => ({
                index,
                type,
                hash,
                input,
                skip,
                timestamp,
                scope: strand.scope,
                branch: strand.branch
            })
        );

        const result = await (!strand.documentId
            ? this.addDriveOperations(
                  strand.driveId,
                  operations as Operation<DocumentDriveAction | BaseAction>[],
                  false
              )
            : this.addOperations(
                  strand.driveId,
                  strand.documentId,
                  operations,
                  false
              ));
        if (result.status === 'ERROR') {
            this.updateSyncStatus(strand.driveId, result.status, result.error);
        }
        this.emit('strandUpdate', strand);
        return result;
    }

    private handleListenerError(
        error: Error,
        driveId: string,
        listener: ListenerState
    ) {
        logger.error(
            `Listener ${listener.listener.label ?? listener.listener.listenerId} error:`,
            error
        );
        this.updateSyncStatus(
            driveId,
            error instanceof OperationError ? error.status : 'ERROR',
            error
        );
    }

    private shouldSyncRemoteDrive(drive: DocumentDriveDocument) {
        return (
            drive.state.local.availableOffline &&
            drive.state.local.triggers.length > 0
        );
    }

    private async startSyncRemoteDrive(driveId: string) {
        const drive = await this.getDrive(driveId);
        let driveTriggers = this.triggerMap.get(driveId);

        for (const trigger of drive.state.local.triggers) {
            if (driveTriggers?.get(trigger.id)) {
                continue;
            }

            if (!driveTriggers) {
                driveTriggers = new Map();
            }

            this.updateSyncStatus(driveId, 'SYNCING');
            if (PullResponderTransmitter.isPullResponderTrigger(trigger)) {
                const cancelPullLoop = PullResponderTransmitter.setupPull(
                    driveId,
                    trigger,
                    this.saveStrand.bind(this),
                    error => {
                        this.updateSyncStatus(
                            driveId,
                            error instanceof OperationError
                                ? error.status
                                : 'ERROR',
                            error
                        );
                    },
                    revisions => {
                        const errorRevision = revisions.find(
                            r => r.status !== 'SUCCESS'
                        );
                        if (!errorRevision) {
                            this.updateSyncStatus(driveId, 'SUCCESS');
                        }
                    }
                );
                driveTriggers.set(trigger.id, cancelPullLoop);
                this.triggerMap.set(driveId, driveTriggers);
            }
        }
    }

    private async stopSyncRemoteDrive(driveId: string) {
        const triggers = this.triggerMap.get(driveId);
        triggers?.forEach(cancel => cancel());
        this.updateSyncStatus(driveId, null);
        return this.triggerMap.delete(driveId);
    }

    async initialize() {
        const drives = await this.getDrives();
        for (const drive of drives) {
            await this._initializeDrive(drive);
        }
    }

    private async _initializeDrive(driveId: string) {
        const drive = await this.getDrive(driveId);

        if (this.shouldSyncRemoteDrive(drive)) {
            await this.startSyncRemoteDrive(driveId);
        }

        await this.listenerStateManager.initDrive(drive);
    }

    public async getSynchronizationUnits(
        driveId: string,
        documentId?: string[],
        scope?: string[],
        branch?: string[],
        documentType?: string[]
    ) {
        const drive = await this.getDrive(driveId);

        const nodes = drive.state.global.nodes.filter(
            node =>
                isFileNode(node) &&
                (!documentId?.length ||
                    documentId.includes(node.id) ||
                    documentId.includes('*')) &&
                (!documentType?.length ||
                    documentType.includes(node.documentType) ||
                    documentType.includes('*'))
        ) as Pick<FileNode, 'id' | 'documentType' | 'synchronizationUnits'>[];

        // checks if document drive synchronization unit should be added
        if (
            (!documentId ||
                documentId.includes('*') ||
                documentId.includes('')) &&
            (!documentType?.length ||
                documentType.includes('powerhouse/document-drive') ||
                documentType.includes('*'))
        ) {
            nodes.unshift({
                id: '',
                documentType: 'powerhouse/document-drive',
                synchronizationUnits: [
                    {
                        syncId: '0',
                        scope: 'global',
                        branch: 'main'
                    }
                ]
            });
        }

        const synchronizationUnits: SynchronizationUnit[] = [];

        for (const node of nodes) {
            const nodeUnits =
                scope?.length || branch?.length
                    ? node.synchronizationUnits.filter(
                          unit =>
                              (!scope?.length ||
                                  scope.includes(unit.scope) ||
                                  scope.includes('*')) &&
                              (!branch?.length ||
                                  branch.includes(unit.branch) ||
                                  branch.includes('*'))
                      )
                    : node.synchronizationUnits;
            if (!nodeUnits.length) {
                continue;
            }

            const document = await (node.id
                ? this.getDocument(driveId, node.id)
                : this.getDrive(driveId));

            for (const { syncId, scope, branch } of nodeUnits) {
                const operations =
                    document.operations[scope as OperationScope] ?? [];
                const lastOperation = operations.pop();
                synchronizationUnits.push({
                    syncId,
                    scope,
                    branch,
                    driveId,
                    documentId: node.id,
                    documentType: node.documentType,
                    lastUpdated:
                        lastOperation?.timestamp ?? document.lastModified,
                    revision: lastOperation?.index ?? 0
                });
            }
        }
        return synchronizationUnits;
    }

    public async getSynchronizationUnit(
        driveId: string,
        syncId: string
    ): Promise<SynchronizationUnit> {
        const drive = await this.getDrive(driveId);
        const node = drive.state.global.nodes.find(
            node =>
                isFileNode(node) &&
                node.synchronizationUnits.find(unit => unit.syncId === syncId)
        );

        if (!node || !isFileNode(node)) {
            throw new Error('Synchronization unit not found');
        }

        const { scope, branch } = node.synchronizationUnits.find(
            unit => unit.syncId === syncId
        )!;

        const documentId = node.id;
        const document = await this.getDocument(driveId, documentId);
        const operations = document.operations[scope as OperationScope] ?? [];
        const lastOperation = operations.pop();

        return {
            syncId,
            scope,
            branch,
            driveId,
            documentId,
            documentType: node.documentType,
            lastUpdated: lastOperation?.timestamp ?? document.lastModified,
            revision: lastOperation?.index ?? 0
        };
    }

    async getOperationData(
        driveId: string,
        syncId: string,
        filter: {
            since?: string | undefined;
            fromRevision?: number | undefined;
        }
    ): Promise<OperationUpdate[]> {
        const { documentId, scope } =
            syncId === '0'
                ? { documentId: '', scope: 'global' }
                : await this.getSynchronizationUnit(driveId, syncId);

        const document =
            syncId === '0'
                ? await this.getDrive(driveId)
                : await this.getDocument(driveId, documentId); // TODO replace with getDocumentOperations

        const operations = document.operations[scope as OperationScope] ?? []; // TODO filter by branch also
        const filteredOperations = operations.filter(
            operation =>
                Object.keys(filter).length === 0 ||
                ((filter.since === undefined ||
                    isBefore(filter.since, operation.timestamp)) &&
                    (filter.fromRevision === undefined ||
                        operation.index > filter.fromRevision))
        );

        return filteredOperations.map(operation => ({
            hash: operation.hash,
            index: operation.index,
            timestamp: operation.timestamp,
            type: operation.type,
            input: operation.input as object,
            skip: operation.skip
        }));
    }

    private _getDocumentModel(documentType: string) {
        const documentModel = this.documentModels.find(
            model => model.documentModel.id === documentType
        );
        if (!documentModel) {
            throw new Error(`Document type ${documentType} not supported`);
        }
        return documentModel;
    }

    async addDrive(drive: DriveInput) {
        const id = drive.global.id || generateUUID();
        if (!id) {
            throw new Error('Invalid Drive Id');
        }
        
        const drives = await this.storage.getDrives();
        if (drives.includes(id)) {
            throw new Error('Drive already exists');
        }

        const document = utils.createDocument({
            state: drive
        });

        await this.storage.createDrive(id, document);
        await this._initializeDrive(id);
        return document;
    }

    async addRemoteDrive(url: string, options: RemoteDriveOptions) {
        const { id, name, slug, icon } = await requestPublicDrive(url);
        const {
            pullFilter,
            pullInterval,
            availableOffline,
            sharingType,
            listeners,
            triggers
        } = options;

        const pullTrigger =
            await PullResponderTransmitter.createPullResponderTrigger(id, url, {
                pullFilter,
                pullInterval
            });

        return await this.addDrive({
            global: {
                id: id,
                name,
                slug,
                icon: icon ?? null
            },
            local: {
                triggers: [...triggers, pullTrigger],
                listeners: listeners,
                availableOffline,
                sharingType
            }
        });
    }

    deleteDrive(id: string) {
        this.stopSyncRemoteDrive(id);
        return this.storage.deleteDrive(id);
    }

    getDrives() {
        return this.storage.getDrives();
    }

    async getDrive(drive: string, options?: GetDocumentOptions) {
        const driveStorage = await this.storage.getDrive(drive);
        const documentModel = this._getDocumentModel(driveStorage.documentType);
        const document = baseUtils.replayDocument(
            driveStorage.initialState,
            filterOperationsByRevision(
                driveStorage.operations,
                options?.revisions
            ),
            documentModel.reducer,
            undefined,
            driveStorage
        );
        if (!isDocumentDrive(document)) {
            throw new Error(
                `Document with id ${drive} is not a Document Drive`
            );
        } else {
            return document;
        }
    }

    async getDocument(drive: string, id: string, options?: GetDocumentOptions) {
        const { initialState, operations, ...header } =
            await this.storage.getDocument(drive, id);

        const documentModel = this._getDocumentModel(header.documentType);

        return baseUtils.replayDocument(
            initialState,
            filterOperationsByRevision(operations, options?.revisions),
            documentModel.reducer,
            undefined,
            header
        );
    }

    getDocuments(drive: string) {
        return this.storage.getDocuments(drive);
    }

    protected async createDocument(
        driveId: string,
        input: CreateDocumentInput
    ) {
        const documentModel = this._getDocumentModel(input.documentType);
        // TODO validate input.document is of documentType
        const document = input.document ?? documentModel.utils.createDocument();

        await this.storage.createDocument(driveId, input.id, document);

        return document;
    }

    async deleteDocument(driveId: string, id: string) {
        try {
            const syncUnits = await this.getSynchronizationUnits(driveId, [id]);
            await this.listenerStateManager.removeSyncUnits(driveId, syncUnits);
        } catch (error) {
            logger.warn('Error deleting document', error);
        }
        return this.storage.deleteDocument(driveId, id);
    }

    async _processOperations<T extends Document, A extends Action>(
        drive: string,
        storageDocument: DocumentStorage<T>,
        operations: Operation<A | BaseAction>[]
    ) {
        const operationsApplied: Operation<A | BaseAction>[] = [];
        const operationsUpdated: Operation<A | BaseAction>[] = [];
        const signals: SignalResult[] = [];

        let document: T = this._buildDocument(storageDocument);
        let error: OperationError | undefined; // TODO: replace with an array of errors/consistency issues
        const operationsByScope = groupOperationsByScope(operations);

        for (const scope of Object.keys(operationsByScope)) {
            const storageDocumentOperations =
                storageDocument.operations[scope as OperationScope];

            const branch = removeExistingOperations(
                operationsByScope[scope as OperationScope] || [],
                storageDocumentOperations
            );

            const trunk = garbageCollect(
                sortOperations(storageDocumentOperations)
            );

            const [invertedTrunk, tail] = attachBranch(trunk, branch);

            const newHistory =
                tail.length < 1
                    ? invertedTrunk
                    : merge(trunk, invertedTrunk, reshuffleByTimestamp);

            const lastOriginalOperation = trunk[trunk.length - 1];

            const newOperations = newHistory.filter(
                op => trunk.length < 1 || precedes(trunk[trunk.length - 1]!, op)
            );

            const firstNewOperation = newOperations[0];
            let updatedOperationIndex = -1;

            if (lastOriginalOperation && firstNewOperation) {
                if (lastOriginalOperation.index === firstNewOperation.index) {
                    if (lastOriginalOperation.skip >= firstNewOperation.skip) {
                        console.error(
                            'Unexpected firstNewOperation.skip lower than or equal to lastOriginalOperation.skip.'
                        );
                    }

                    updatedOperationIndex = firstNewOperation.index;
                }
            }

            for (const nextOperation of newOperations) {
                let skipHashValidation = false;

                // when dealing with a merge (tail.length > 0) we have to skip hash validation
                // for the operations that were re-indexed (previous hash becomes invalid due the new position in the history)
                if (tail.length > 0) {
                    skipHashValidation = [...invertedTrunk, ...tail].some(
                        invertedTrunkOp =>
                            invertedTrunkOp.hash === nextOperation.hash
                    );
                }

                try {
                    const appliedResult = await this._performOperation<T, A>(
                        drive,
                        document,
                        nextOperation,
                        skipHashValidation
                    );
                    document = appliedResult.document;
                    signals.push(...appliedResult.signals);

                    if (nextOperation.index === updatedOperationIndex) {
                        operationsUpdated.push(...appliedResult.operation);
                    } else {
                        operationsApplied.push(...appliedResult.operation);
                    }
                } catch (e) {
                    error =
                        e instanceof OperationError
                            ? e
                            : new OperationError(
                                  'ERROR',
                                  nextOperation,
                                  (e as Error).message,
                                  (e as Error).cause
                              );

                    // TODO: don't break on errors...
                    break;
                }
            }
        }

        return {
            document,
            operationsApplied,
            signals,
            error,
            operationsUpdated
        } as const;
    }

    private _buildDocument<T extends Document>(
        documentStorage: DocumentStorage<T>
    ): T {
        const documentModel = this._getDocumentModel(
            documentStorage.documentType
        );
        return baseUtils.replayDocument(
            documentStorage.initialState,
            documentStorage.operations,
            documentModel.reducer,
            undefined,
            documentStorage
        ) as T;
    }

    private async _performOperation<T extends Document, A extends Action>(
        drive: string,
        documentStorage: DocumentStorage<T>,
        operation: Operation<A | BaseAction>,
        skipHashValidation = false
    ) {
        const documentModel = this._getDocumentModel(
            documentStorage.documentType
        );
        const document = this._buildDocument(documentStorage);

        const signalResults: SignalResult[] = [];
        let newDocument = document;

        const operationSignals: (() => Promise<SignalResult>)[] = [];
        newDocument = documentModel.reducer(
            newDocument,
            operation,
            signal => {
                let handler: (() => Promise<unknown>) | undefined = undefined;
                switch (signal.type) {
                    case 'CREATE_CHILD_DOCUMENT':
                        handler = () =>
                            this.createDocument(drive, signal.input);
                        break;
                    case 'DELETE_CHILD_DOCUMENT':
                        handler = () =>
                            this.deleteDocument(drive, signal.input.id);
                        break;
                    case 'COPY_CHILD_DOCUMENT':
                        handler = () =>
                            this.getDocument(drive, signal.input.id).then(
                                documentToCopy =>
                                    this.createDocument(drive, {
                                        id: signal.input.newId,
                                        documentType:
                                            documentToCopy.documentType,
                                        document: documentToCopy,
                                        synchronizationUnits:
                                            signal.input.synchronizationUnits
                                    })
                            );
                        break;
                }
                if (handler) {
                    operationSignals.push(() =>
                        handler().then(result => ({ signal, result }))
                    );
                }
            },
            { skip: operation.skip }
        ) as T;

        const appliedOperation = newDocument.operations[operation.scope].filter(
            op => op.index == operation.index && op.skip == operation.skip
        );

        if (appliedOperation.length < 1) {
            throw new OperationError(
                'ERROR',
                operation,
                `Operation with index ${operation.index}:${operation.skip} was not applied.`
            );
        } else if (
            operation.type !== 'NOOP' &&
            appliedOperation[0]!.hash !== operation.hash &&
            !skipHashValidation
        ) {
            throw new OperationError(
                'CONFLICT',
                operation,
                `Operation with index ${operation.index}:${operation.skip} has unexpected result hash`
            );
        }

        for (const signalHandler of operationSignals) {
            const result = await signalHandler();
            signalResults.push(result);
        }

        return {
            document: newDocument,
            signals: signalResults,
            operation: appliedOperation
        };
    }

    addOperation(drive: string, id: string, operation: Operation) {
        return this.addOperations(drive, id, [operation]);
    }

    private async _addOperations(
        drive: string,
        id: string,
        callback: (document: DocumentStorage) => Promise<{
            operations: Operation[];
            header: DocumentHeader;
            updatedOperations?: Operation[];
        }>
    ) {
        if (!this.storage.addDocumentOperationsWithTransaction) {
            const documentStorage = await this.storage.getDocument(drive, id);
            const result = await callback(documentStorage);
            // saves the applied operations to storage
            if (
                result.operations.length > 0 ||
                (result.updatedOperations &&
                    result.updatedOperations.length > 0)
            ) {
                await this.storage.addDocumentOperations(
                    drive,
                    id,
                    result.operations,
                    result.header,
                    result.updatedOperations
                );
            }
        } else {
            await this.storage.addDocumentOperationsWithTransaction(
                drive,
                id,
                callback
            );
        }
    }

    async addOperations(
        drive: string,
        id: string,
        operations: Operation[],
        forceSync = true
    ) {
        let document: Document | undefined;
        const operationsApplied: Operation[] = [];
        const updatedOperations: Operation[] = [];
        const signals: SignalResult[] = [];
        let error: Error | undefined;

        try {
            await this._addOperations(drive, id, async documentStorage => {
                const result = await this._processOperations(
                    drive,
                    documentStorage,
                    operations
                );

                if (!result.document) {
                    logger.error('Invalid document');
                    throw result.error ?? new Error('Invalid document');
                }

                document = result.document;
                error = result.error;
                signals.push(...result.signals);
                operationsApplied.push(...result.operationsApplied);
                updatedOperations.push(...result.operationsUpdated);

                return {
                    operations: result.operationsApplied,
                    header: result.document,
                    updatedOperations: result.operationsUpdated
                };
            });

            // gets all the different scopes and branches combinations from the operations
            const { scopes, branches } = [
                ...operationsApplied,
                ...updatedOperations
            ].reduce(
                (acc, operation) => {
                    if (!acc.scopes.includes(operation.scope)) {
                        acc.scopes.push(operation.scope);
                    }
                    return acc;
                },
                { scopes: [] as string[], branches: ['main'] }
            );

            const syncUnits = await this.getSynchronizationUnits(
                drive,
                [id],
                scopes,
                branches
            );
            // update listener cache
            this.listenerStateManager
                .updateSynchronizationRevisions(
                    drive,
                    syncUnits,
                    () => this.updateSyncStatus(drive, 'SYNCING'),
                    this.handleListenerError.bind(this),
                    forceSync
                )
                .then(
                    updates =>
                        updates.length &&
                        this.updateSyncStatus(drive, 'SUCCESS')
                )
                .catch(error => {
                    logger.error(
                        'Non handled error updating sync revision',
                        error
                    );
                    this.updateSyncStatus(drive, 'ERROR', error as Error);
                });

            // after applying all the valid operations,throws
            // an error if there was an invalid operation
            if (error) {
                throw error;
            }

            return {
                status: 'SUCCESS',
                document,
                operations: operationsApplied,
                signals
            } satisfies IOperationResult;
        } catch (error) {
            const operationError =
                error instanceof OperationError
                    ? error
                    : new OperationError(
                          'ERROR',
                          undefined,
                          (error as Error).message,
                          (error as Error).cause
                      );

            return {
                status: operationError.status,
                error: operationError,
                document,
                operations: operationsApplied,
                signals
            } satisfies IOperationResult;
        }
    }

    addDriveOperation(
        drive: string,
        operation: Operation<DocumentDriveAction | BaseAction>
    ) {
        return this.addDriveOperations(drive, [operation]);
    }

    async clearStorage() {
        for (const drive of await this.getDrives()) {
            await this.deleteDrive(drive);
        }

        await this.storage.clearStorage?.();
    }

    private async _addDriveOperations(
        drive: string,
        callback: (document: DocumentDriveStorage) => Promise<{
            operations: Operation<DocumentDriveAction | BaseAction>[];
            header: DocumentHeader;
            updatedOperations?: Operation[];
        }>
    ) {
        if (!this.storage.addDriveOperationsWithTransaction) {
            const documentStorage = await this.storage.getDrive(drive);
            const result = await callback(documentStorage);
            // saves the applied operations to storage
            if (result.operations.length > 0) {
                await this.storage.addDriveOperations(
                    drive,
                    result.operations,
                    result.header
                );
            }
            return result;
        } else {
            return this.storage.addDriveOperationsWithTransaction(
                drive,
                callback
            );
        }
    }

    async addDriveOperations(
        drive: string,
        operations: Operation<DocumentDriveAction | BaseAction>[],
        forceSync = true
    ) {
        let document: DocumentDriveDocument | undefined;
        const operationsApplied: Operation<DocumentDriveAction | BaseAction>[] =
            [];
        const signals: SignalResult[] = [];
        let error: Error | undefined;

        try {
            await this._addDriveOperations(drive, async documentStorage => {
                const result = await this._processOperations<
                    DocumentDriveDocument,
                    DocumentDriveAction
                >(drive, documentStorage, operations.slice());

                document = result.document;
                operationsApplied.push(...result.operationsApplied);
                signals.push(...result.signals);
                error = result.error;

                return {
                    operations: result.operationsApplied,
                    header: result.document,
                    updatedOperations: result.operationsUpdated
                };
            });

            if (!document || !isDocumentDrive(document)) {
                throw error ?? new Error('Invalid Document Drive document');
            }

            for (const operation of operationsApplied) {
                switch (operation.type) {
                    case 'ADD_LISTENER': {
                        await this.addListener(drive, operation);
                        break;
                    }
                    case 'REMOVE_LISTENER': {
                        await this.removeListener(drive, operation);
                        break;
                    }
                }
            }

            // update listener cache
            const lastOperation = operationsApplied
                .filter(op => op.scope === 'global')
                .slice()
                .pop();
            if (lastOperation) {
                this.listenerStateManager
                    .updateSynchronizationRevisions(
                        drive,
                        [
                            {
                                syncId: '0',
                                driveId: drive,
                                documentId: '',
                                scope: 'global',
                                branch: 'main',
                                documentType: 'powerhouse/document-drive',
                                lastUpdated: lastOperation.timestamp,
                                revision: lastOperation.index
                            }
                        ],
                        () => this.updateSyncStatus(drive, 'SYNCING'),
                        this.handleListenerError.bind(this),
                        forceSync
                    )
                    .then(
                        updates =>
                            updates.length &&
                            this.updateSyncStatus(drive, 'SUCCESS')
                    )
                    .catch(error => {
                        logger.error(
                            'Non handled error updating sync revision',
                            error
                        );
                        this.updateSyncStatus(drive, 'ERROR', error as Error);
                    });
            }

            if (this.shouldSyncRemoteDrive(document)) {
                this.startSyncRemoteDrive(document.state.global.id);
            } else {
                this.stopSyncRemoteDrive(document.state.global.id);
            }

            // after applying all the valid operations,throws
            // an error if there was an invalid operation
            if (error) {
                throw error;
            }

            return {
                status: 'SUCCESS',
                document,
                operations: operationsApplied,
                signals
            } satisfies IOperationResult;
        } catch (error) {
            const operationError =
                error instanceof OperationError
                    ? error
                    : new OperationError(
                          'ERROR',
                          undefined,
                          (error as Error).message,
                          (error as Error).cause
                      );

            return {
                status: operationError.status,
                error: operationError,
                document,
                operations: operationsApplied,
                signals
            } satisfies IOperationResult;
        }
    }

    private _buildOperation<T extends Action>(
        documentStorage: DocumentStorage,
        action: T | BaseAction
    ): Operation<T | BaseAction> {
        const [operation] = this._buildOperations(documentStorage, [action]);
        if (!operation) {
            throw new Error('Error creating operation');
        }
        return operation;
    }

    private _buildOperations<T extends Action>(
        documentStorage: DocumentStorage,
        actions: (T | BaseAction)[]
    ): Operation<T | BaseAction>[] {
        const operations: Operation<T | BaseAction>[] = [];
        const { reducer } = this._getDocumentModel(
            documentStorage.documentType
        );
        let document = baseUtils.replayDocument(
            documentStorage.initialState,
            documentStorage.operations,
            reducer,
            undefined,
            documentStorage
        );
        for (const action of actions) {
            document = reducer(document, action);
            const operation = document.operations[action.scope].slice().pop();
            if (!operation) {
                throw new Error('Error creating operations');
            }
            operations.push(operation);
        }
        return operations;
    }

    async addAction(
        drive: string,
        id: string,
        action: Action
    ): Promise<IOperationResult> {
        const documentStorage = await this.storage.getDocument(drive, id);
        const operation = this._buildOperation(documentStorage, action);
        return this.addOperation(drive, id, operation);
    }

    async addActions(
        drive: string,
        id: string,
        actions: Action[]
    ): Promise<IOperationResult> {
        const documentStorage = await this.storage.getDocument(drive, id);
        const operations = this._buildOperations(documentStorage, actions);
        return this.addOperations(drive, id, operations);
    }

    async addDriveAction(
        drive: string,
        action: DocumentDriveAction | BaseAction
    ): Promise<IOperationResult<DocumentDriveDocument>> {
        const documentStorage = await this.storage.getDrive(drive);
        const operation = this._buildOperation(documentStorage, action);
        return this.addDriveOperation(drive, operation);
    }

    async addDriveActions(
        drive: string,
        actions: (DocumentDriveAction | BaseAction)[]
    ): Promise<IOperationResult<DocumentDriveDocument>> {
        const documentStorage = await this.storage.getDrive(drive);
        const operations = this._buildOperations(documentStorage, actions);
        return this.addDriveOperations(drive, operations);
    }

    async addInternalListener(
        driveId: string,
        receiver: IReceiver,
        options: {
            listenerId: string;
            label: string;
            block: boolean;
            filter: ListenerFilter;
        }
    ) {
        const listener: AddListenerInput['listener'] = {
            callInfo: {
                data: '',
                name: 'Interal',
                transmitterType: 'Internal'
            },
            system: true,
            ...options
        };
        await this.addDriveAction(driveId, actions.addListener({ listener }));
        const transmitter = await this.getTransmitter(
            driveId,
            options.listenerId
        );
        if (!transmitter) {
            logger.error('Internal listener not found');
            throw new Error('Internal listener not found');
        }
        if (!(transmitter instanceof InternalTransmitter)) {
            logger.error('Listener is not an internal transmitter');
            throw new Error('Listener is not an internal transmitter');
        }

        transmitter.setReceiver(receiver);
        return transmitter;
    }

    private async addListener(
        driveId: string,
        operation: Operation<Action<'ADD_LISTENER', AddListenerInput>>
    ) {
        const { listener } = operation.input;
        await this.listenerStateManager.addListener({
            ...listener,
            driveId,
            label: listener.label ?? '',
            system: listener.system ?? false,
            filter: {
                branch: listener.filter.branch ?? [],
                documentId: listener.filter.documentId ?? [],
                documentType: listener.filter.documentType ?? [],
                scope: listener.filter.scope ?? []
            },
            callInfo: {
                data: listener.callInfo?.data ?? '',
                name: listener.callInfo?.name ?? 'PullResponder',
                transmitterType:
                    listener.callInfo?.transmitterType ?? 'PullResponder'
            }
        });
    }

    private async removeListener(
        driveId: string,
        operation: Operation<Action<'REMOVE_LISTENER', RemoveListenerInput>>
    ) {
        const { listenerId } = operation.input;
        await this.listenerStateManager.removeListener(driveId, listenerId);
    }

    getTransmitter(
        driveId: string,
        listenerId: string
    ): Promise<ITransmitter | undefined> {
        return this.listenerStateManager.getTransmitter(driveId, listenerId);
    }

    getListener(
        driveId: string,
        listenerId: string
    ): Promise<ListenerState | undefined> {
        return this.listenerStateManager.getListener(driveId, listenerId);
    }

    getSyncStatus(drive: string): SyncStatus {
        const status = this.syncStatus.get(drive);
        if (!status) {
            logger.error(`Sync status not found for drive ${drive}`);
            throw new Error(`Sync status not found for drive ${drive}`);
        }
        return status;
    }

    on<K extends keyof DriveEvents>(event: K, cb: DriveEvents[K]): Unsubscribe {
        return this.emitter.on(event, cb);
    }

    protected emit<K extends keyof DriveEvents>(
        event: K,
        ...args: Parameters<DriveEvents[K]>
    ): void {
        logger.debug(`Emitting event ${event}`, args);
        return this.emitter.emit(event, ...args);
    }
}
