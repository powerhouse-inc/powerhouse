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
    DocumentModel,
    Operation,
    OperationScope
} from 'document-model/document';
import { createNanoEvents, Unsubscribe } from 'nanoevents';
import { MemoryStorage } from '../storage/memory';
import type { DocumentStorage, IDriveStorage } from '../storage/types';
import {
    generateUUID,
    isBefore,
    isDocumentDrive,
    isNoopUpdate
} from '../utils';
import { requestPublicDrive } from '../utils/graphql';
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
        } else if (this.getSyncStatus(driveId) !== status) {
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
                  operations as Operation<DocumentDriveAction | BaseAction>[]
              )
            : this.addOperations(
                  strand.driveId,
                  strand.documentId,
                  operations
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
        console.error(
            `Listener ${listener.listener.label ?? listener.listener.listenerId} error: ${error.message}`
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
        await this.listenerStateManager.init();
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

        for (const listener of drive.state.local.listeners) {
            await this.listenerStateManager.addListener({
                driveId,
                block: listener.block,
                filter: {
                    branch: listener.filter.branch ?? [],
                    documentId: listener.filter.documentId ?? [],
                    documentType: listener.filter.documentType ?? [],
                    scope: listener.filter.scope ?? []
                },
                listenerId: listener.listenerId,
                system: listener.system,
                callInfo: listener.callInfo ?? undefined,
                label: listener.label ?? ''
            });
        }
    }

    public async getSynchronizationUnits(
        driveId: string,
        documentId?: string[],
        scope?: string[],
        branch?: string[]
    ) {
        const drive = await this.getDrive(driveId);

        const nodes = drive.state.global.nodes.filter(
            node =>
                isFileNode(node) &&
                (!documentId?.length ||
                    documentId.includes(node.id) ||
                    documentId.includes('*'))
        ) as Pick<
            FileNode,
            'id' | 'documentType' | 'scopes' | 'synchronizationUnits'
        >[];

        if (documentId && !nodes.length) {
            throw new Error('File node not found');
        }

        // checks if document drive synchronization unit should be added
        if (
            !documentId ||
            documentId.includes('*') ||
            documentId.includes('')
        ) {
            nodes.unshift({
                id: '',
                documentType: 'powerhouse/document-drive',
                scopes: ['global'],
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
                              (!scope?.length || scope.includes(unit.scope)) &&
                              (!branch?.length || branch.includes(unit.branch))
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
        try {
            const driveStorage = await this.storage.getDrive(id);
            if (driveStorage) {
                throw new Error('Drive already exists');
            }
        } catch {
            // ignore error has it means drive does not exist already
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

        await this.listenerStateManager.addSyncUnits(
            input.synchronizationUnits.map(({ syncId, scope, branch }) => {
                const lastOperation = document.operations[scope].slice().pop();
                return {
                    syncId,
                    scope,
                    branch,
                    driveId,
                    documentId: input.id,
                    documentType: document.documentType,
                    lastUpdated:
                        lastOperation?.timestamp ?? document.lastModified,
                    revision: lastOperation?.index ?? 0
                };
            })
        );
        return document;
    }

    async deleteDocument(driveId: string, id: string) {
        try {
            const syncUnits = await this.getSynchronizationUnits(driveId, [id]);
            this.listenerStateManager.removeSyncUnits(syncUnits);
        } catch {
            /* empty */
        }
        return this.storage.deleteDocument(driveId, id);
    }

    async _processOperations<T extends Document, A extends Action>(
        drive: string,
        documentStorage: DocumentStorage<T>,
        operations: Operation<A | BaseAction>[]
    ) {
        const operationsApplied: Operation<A | BaseAction>[] = [];
        const operationsUpdated: Operation<A | BaseAction>[] = [];
        let document: T | undefined;
        const signals: SignalResult[] = [];

        // eslint-disable-next-line prefer-const
        let [operationsToApply, error, updatedOperations] =
            this._validateOperations(operations, documentStorage);

        const unregisteredOps = [
            ...operationsToApply.map(operation => ({ operation, type: 'new' })),
            ...updatedOperations.map(operation => ({
                operation,
                type: 'update'
            }))
        ].sort((a, b) => a.operation.index - b.operation.index);

        // retrieves the document's document model and
        // applies the operations using its reducer
        for (const unregisteredOp of unregisteredOps) {
            const { operation, type } = unregisteredOp;

            try {
                const {
                    document: newDocument,
                    signals,
                    operation: appliedOperation
                } = await this._performOperation(
                    drive,
                    document ?? documentStorage,
                    operation
                );
                document = newDocument;

                if (type === 'new') {
                    operationsApplied.push(appliedOperation);
                } else {
                    operationsUpdated.push(appliedOperation);
                }

                signals.push(...signals);
            } catch (e) {
                if (!error) {
                    error =
                        e instanceof OperationError
                            ? e
                            : new OperationError(
                                  'ERROR',
                                  operation,
                                  (e as Error).message,
                                  (e as Error).cause
                              );
                }
                break;
            }
        }

        if (!document) {
            document = this._buildDocument(documentStorage);
        }

        return {
            document,
            operationsApplied,
            signals,
            error,
            operationsUpdated
        } as const;
    }

    private _validateOperations<T extends Document, A extends Action>(
        operations: Operation<A | BaseAction>[],
        documentStorage: DocumentStorage<T>
    ) {
        const operationsToApply: Operation<A | BaseAction>[] = [];
        const updatedOperations: Operation<A | BaseAction>[] = [];
        let error: OperationError | undefined;

        // sort operations so from smaller index to biggest
        operations = operations.sort((a, b) => a.index - b.index);

        for (let i = 0; i < operations.length; i++) {
            const op = operations[i]!;
            const pastOperations = operationsToApply
                .filter(appliedOperation => appliedOperation.scope === op.scope)
                .slice(0, i);
            const scopeOperations = documentStorage.operations[op.scope];

            // get latest operation
            const ops = [...scopeOperations, ...pastOperations];
            const latestOperation = ops.slice().pop();

            const noopUpdate = isNoopUpdate(op, latestOperation);

            let nextIndex = scopeOperations.length + pastOperations.length;
            if (noopUpdate) {
                nextIndex = nextIndex - 1;
            }

            if (op.index > nextIndex) {
                error = new OperationError(
                    'MISSING',
                    op,
                    `Missing operation on index ${nextIndex}`
                );
                continue;
            } else if (op.index < nextIndex) {
                const existingOperation = scopeOperations
                    .concat(pastOperations)
                    .find(
                        existingOperation =>
                            existingOperation.index === op.index
                    );
                if (existingOperation && existingOperation.hash !== op.hash) {
                    error = new OperationError(
                        'CONFLICT',
                        op,
                        `Conflicting operation on index ${op.index}`,
                        { existingOperation, newOperation: op }
                    );
                    continue;
                } else if (!existingOperation) {
                    error = new OperationError(
                        'MISSING',
                        op,
                        `Missing operation on index ${nextIndex}`
                    );
                    continue;
                }
            } else {
                if (noopUpdate) {
                    updatedOperations.push(op);
                } else {
                    operationsToApply.push(op);
                }
            }
        }

        return [operationsToApply, error, updatedOperations] as const;
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
        operation: Operation<A | BaseAction>
    ) {
        const documentModel = this._getDocumentModel(
            documentStorage.documentType
        );
        const document = this._buildDocument(documentStorage);

        const signalResults: SignalResult[] = [];
        let newDocument = document;

        const operationSignals: (() => Promise<SignalResult>)[] = [];
        newDocument = documentModel.reducer(newDocument, operation, signal => {
            let handler: (() => Promise<unknown>) | undefined = undefined;
            switch (signal.type) {
                case 'CREATE_CHILD_DOCUMENT':
                    handler = () => this.createDocument(drive, signal.input);
                    break;
                case 'DELETE_CHILD_DOCUMENT':
                    handler = () => this.deleteDocument(drive, signal.input.id);
                    break;
                case 'COPY_CHILD_DOCUMENT':
                    handler = () =>
                        this.getDocument(drive, signal.input.id).then(
                            documentToCopy =>
                                this.createDocument(drive, {
                                    id: signal.input.newId,
                                    documentType: documentToCopy.documentType,
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
        }) as T;

        const appliedOperation =
            newDocument.operations[operation.scope][operation.index];
        if (!appliedOperation || appliedOperation.hash !== operation.hash) {
            throw new OperationError(
                'CONFLICT',
                operation,
                `Operation with index ${operation.index} had different result`
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

    async addOperations(drive: string, id: string, operations: Operation[]) {
        // retrieves document from storage
        const documentStorage = await this.storage.getDocument(drive, id);

        let document: Document | undefined;
        const operationsApplied: Operation[] = [];
        const updatedOperations: Operation[] = [];
        const signals: SignalResult[] = [];
        let error: Error | undefined;

        try {
            // retrieves the document's document model and
            // applies the operations using its reducer
            const result = await this._processOperations(
                drive,
                documentStorage,
                operations
            );

            document = result.document;

            operationsApplied.push(...result.operationsApplied);
            updatedOperations.push(...result.operationsUpdated);

            signals.push(...result.signals);
            error = result.error;

            if (!document) {
                throw error ?? new Error('Invalid document');
            }

            // saves the applied operations to storage
            if (operationsApplied.length > 0 || updatedOperations.length > 0) {
                await this.storage.addDocumentOperations(
                    drive,
                    id,
                    operationsApplied,
                    document,
                    updatedOperations
                );
            }

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
            for (const syncUnit of syncUnits) {
                this.listenerStateManager
                    .updateSynchronizationRevision(
                        drive,
                        syncUnit.syncId,
                        syncUnit.revision,
                        syncUnit.lastUpdated,
                        () => this.updateSyncStatus(drive, 'SYNCING'),
                        this.handleListenerError.bind(this)
                    )
                    .then(
                        updates =>
                            updates.length &&
                            this.updateSyncStatus(drive, 'SUCCESS')
                    )
                    .catch(error => {
                        console.error(
                            'Non handled error updating sync revision',
                            error
                        );
                        this.updateSyncStatus(drive, 'ERROR', error as Error);
                    });
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

    async addDriveOperations(
        drive: string,
        operations: Operation<DocumentDriveAction | BaseAction>[]
    ) {
        // retrieves document from storage
        const documentStorage = await this.storage.getDrive(drive);

        let document: DocumentDriveDocument | undefined;
        const operationsApplied: Operation<DocumentDriveAction | BaseAction>[] =
            [];
        const signals: SignalResult[] = [];
        let error: Error | undefined;

        try {
            const result = await this._processOperations<
                DocumentDriveDocument,
                DocumentDriveAction
            >(drive, documentStorage, operations.slice());

            document = result.document;
            operationsApplied.push(...result.operationsApplied);
            signals.push(...result.signals);
            error = result.error;

            if (!document || !isDocumentDrive(document)) {
                throw error ?? new Error('Invalid Document Drive document');
            }

            // saves the applied operations to storage
            if (operationsApplied.length > 0) {
                await this.storage.addDriveOperations(
                    drive,
                    operationsApplied,
                    document
                );
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
                    .updateSynchronizationRevision(
                        drive,
                        '0',
                        lastOperation.index,
                        lastOperation.timestamp,
                        () => this.updateSyncStatus(drive, 'SYNCING'),
                        this.handleListenerError.bind(this)
                    )
                    .then(
                        updates =>
                            updates.length &&
                            this.updateSyncStatus(drive, 'SUCCESS')
                    )
                    .catch(error => {
                        console.error(
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
            throw new Error('Internal listener not found');
        }
        if (!(transmitter instanceof InternalTransmitter)) {
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
        return this.emitter.emit(event, ...args);
    }
}
