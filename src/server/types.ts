import type {
    DocumentDriveAction,
    DocumentDriveDocument,
    DocumentDriveLocalState,
    DocumentDriveState,
    ListenerCallInfo,
    ListenerFilter,
    Trigger
} from 'document-model-libs/document-drive';
import type {
    Action,
    ActionContext,
    BaseAction,
    CreateChildDocumentInput,
    Document,
    DocumentModel,
    Operation,
    OperationScope,
    ReducerOptions,
    Signal,
    State
} from 'document-model/document';
import { Unsubscribe } from 'nanoevents';
import { BaseDocumentDriveServer } from '.';
import { IReadMoveDriveServer } from '../read-mode/types';
import { RunAsap } from '../utils';
import { DriveInfo } from '../utils/graphql';
import { OperationError, SynchronizationUnitNotFoundError } from './error';
import {
    ITransmitter,
    PullResponderTrigger,
    StrandUpdateSource
} from './listener/transmitter/types';

// eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/no-explicit-any
export type Constructor<T = object> = new (...args: any[]) => T;

export type DocumentDriveServerConstructor =
    Constructor<BaseDocumentDriveServer>;

// Mixin type that returns a type extending both the base class and the interface
export type Mixin<T extends Constructor, I> = T &
    Constructor<InstanceType<T> & I>;

export type DocumentDriveServerMixin<I> = Mixin<
    DocumentDriveServerConstructor,
    I
>;

export type DriveInput = State<
    Omit<DocumentDriveState, '__typename' | 'id' | 'nodes'> & { id?: string },
    DocumentDriveLocalState
>;

export type RemoteDriveOptions = DocumentDriveLocalState & {
    // TODO make local state optional
    pullFilter?: ListenerFilter;
    pullInterval?: number;
    expectedDriveInfo?: DriveInfo;
};

export type CreateDocumentInput = CreateChildDocumentInput;

export type SignalResult = {
    signal: Signal;
    result: unknown; // infer from return types on document-model
};

export type IOperationResult<T extends Document = Document> = {
    status: UpdateStatus;
    error?: OperationError;
    operations: Operation[];
    document: T | undefined;
    signals: SignalResult[];
};

export type SynchronizationUnit = {
    syncId: string;
    driveId: string;
    documentId: string;
    documentType: string;
    scope: string;
    branch: string;
    lastUpdated: string;
    revision: number;
};

export type SynchronizationUnitQuery = Omit<
    SynchronizationUnit,
    'revision' | 'lastUpdated'
>;

export type Listener = {
    driveId: string;
    listenerId: string;
    label?: string;
    block: boolean;
    system: boolean;
    filter: ListenerFilter;
    callInfo?: ListenerCallInfo;
};

export type CreateListenerInput = {
    driveId: string;
    label?: string;
    block: boolean;
    system: boolean;
    filter: ListenerFilter;
    callInfo?: ListenerCallInfo;
};

export enum TransmitterType {
    Internal,
    SwitchboardPush,
    PullResponder,
    SecureConnect,
    MatrixConnect,
    RESTWebhook
}

export type ListenerRevision = {
    driveId: string;
    documentId: string;
    scope: string;
    branch: string;
    status: UpdateStatus;
    revision: number;
    error?: string;
};

export type ListenerRevisionWithError = Omit<ListenerRevision, 'error'> & {
    error?: Error;
};

export type ListenerUpdate = {
    listenerId: string;
    listenerRevisions: ListenerRevision[];
};

export type UpdateStatus = 'SUCCESS' | 'CONFLICT' | 'MISSING' | 'ERROR';
export type ErrorStatus = Exclude<UpdateStatus, 'SUCCESS'>;

export type OperationUpdate = {
    timestamp: string;
    index: number;
    skip: number;
    type: string;
    input: object;
    hash: string;
    context?: ActionContext;
    id?: string;
};

export type StrandUpdate = {
    driveId: string;
    documentId: string;
    scope: OperationScope;
    branch: string;
    operations: OperationUpdate[];
};

export type SyncStatus = 'INITIAL_SYNC' | 'SYNCING' | UpdateStatus;

export type PullSyncStatus = SyncStatus;
export type PushSyncStatus = SyncStatus;

export type SyncUnitStatusObject = {
    push?: PushSyncStatus;
    pull?: PullSyncStatus;
};

export type AddRemoteDriveStatus =
    | 'SUCCESS'
    | 'ERROR'
    | 'PENDING'
    | 'ADDING'
    | 'ALREADY_ADDED';

export interface DriveEvents {
    syncStatus: (
        driveId: string,
        status: SyncStatus,
        error?: Error,
        syncUnitStatus?: SyncUnitStatusObject
    ) => void;
    defaultRemoteDrive: (
        status: AddRemoteDriveStatus,
        defaultDrives: Map<string, DefaultRemoteDriveInfo>,
        driveInput: DefaultRemoteDriveInput,
        driveId?: string,
        driveName?: string,
        error?: Error
    ) => void;
    strandUpdate: (update: StrandUpdate) => void;
    clientStrandsError: (
        driveId: string,
        trigger: Trigger,
        status: number,
        errorMessage: string
    ) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PartialRecord<K extends keyof any, T> = {
    [P in K]?: T;
};

export type RevisionsFilter = PartialRecord<OperationScope, number>;

export type GetDocumentOptions = ReducerOptions & {
    revisions?: RevisionsFilter;
    checkHashes?: boolean;
};

export type AddOperationOptions = {
    forceSync?: boolean;
    source: StrandUpdateSource;
};

export type DefaultRemoteDriveInput = {
    url: string;
    options: RemoteDriveOptions;
};

export type DefaultRemoteDriveInfo = DefaultRemoteDriveInput & {
    status: AddRemoteDriveStatus;
    metadata?: DriveInfo;
};

export type RemoveOldRemoteDrivesOption =
    | {
          strategy: 'remove-all';
      }
    | {
          strategy: 'preserve-all';
      }
    | {
          strategy: 'remove-by-id';
          ids: string[];
      }
    | {
          strategy: 'remove-by-url';
          urls: string[];
      }
    | {
          strategy: 'preserve-by-id';
          ids: string[];
      }
    | {
          strategy: 'preserve-by-url';
          urls: string[];
      };

export type DocumentDriveServerOptions = {
    defaultRemoteDrives?: Array<DefaultRemoteDriveInput>;
    removeOldRemoteDrives?: RemoveOldRemoteDrivesOption;
    /* method to queue heavy tasks that might block the event loop.
     * If set to null then it will queued as micro task.
     * Defaults to the most appropriate method according to the system
     */
    taskQueueMethod?: RunAsap.RunAsap<unknown> | null;
    listenerManager?: ListenerManagerOptions;
};

export type GetStrandsOptions = {
    limit?: number;
    since?: string;
    fromRevision?: number;
};

export abstract class AbstractDocumentDriveServer {
    /** Public methods **/
    abstract getDrives(): Promise<string[]>;
    abstract addDrive(drive: DriveInput): Promise<DocumentDriveDocument>;
    abstract addRemoteDrive(
        url: string,
        options: RemoteDriveOptions
    ): Promise<DocumentDriveDocument>;
    abstract deleteDrive(id: string): Promise<void>;
    abstract getDrive(
        id: string,
        options?: GetDocumentOptions
    ): Promise<DocumentDriveDocument>;

    abstract getDriveBySlug(slug: string): Promise<DocumentDriveDocument>;

    abstract getDocuments(drive: string): Promise<string[]>;
    abstract getDocument(
        drive: string,
        id: string,
        options?: GetDocumentOptions
    ): Promise<Document>;

    abstract addOperation(
        drive: string,
        id: string,
        operation: Operation,
        options?: AddOperationOptions
    ): Promise<IOperationResult>;

    abstract addOperations(
        drive: string,
        id: string,
        operations: Operation[],
        options?: AddOperationOptions
    ): Promise<IOperationResult>;

    abstract queueOperation(
        drive: string,
        id: string,
        operation: Operation,
        options?: AddOperationOptions
    ): Promise<IOperationResult>;

    abstract queueOperations(
        drive: string,
        id: string,
        operations: Operation[],
        options?: AddOperationOptions
    ): Promise<IOperationResult>;

    abstract queueAction(
        drive: string,
        id: string,
        action: Action,
        options?: AddOperationOptions
    ): Promise<IOperationResult>;

    abstract queueActions(
        drive: string,
        id: string,
        actions: Action[],
        options?: AddOperationOptions
    ): Promise<IOperationResult>;

    abstract addDriveOperation(
        drive: string,
        operation: Operation<DocumentDriveAction | BaseAction>,
        options?: AddOperationOptions
    ): Promise<IOperationResult<DocumentDriveDocument>>;
    abstract addDriveOperations(
        drive: string,
        operations: Operation<DocumentDriveAction | BaseAction>[],
        options?: AddOperationOptions
    ): Promise<IOperationResult<DocumentDriveDocument>>;

    abstract queueDriveOperation(
        drive: string,
        operation: Operation<DocumentDriveAction | BaseAction>,
        options?: AddOperationOptions
    ): Promise<IOperationResult<DocumentDriveDocument>>;

    abstract queueDriveOperations(
        drive: string,
        operations: Operation<DocumentDriveAction | BaseAction>[],
        options?: AddOperationOptions
    ): Promise<IOperationResult<DocumentDriveDocument>>;

    abstract queueDriveAction(
        drive: string,
        action: DocumentDriveAction | BaseAction,
        options?: AddOperationOptions
    ): Promise<IOperationResult<DocumentDriveDocument>>;

    abstract queueDriveActions(
        drive: string,
        actions: Array<DocumentDriveAction | BaseAction>,
        options?: AddOperationOptions
    ): Promise<IOperationResult<DocumentDriveDocument>>;

    abstract addAction(
        drive: string,
        id: string,
        action: Action,
        options?: AddOperationOptions
    ): Promise<IOperationResult>;
    abstract addActions(
        drive: string,
        id: string,
        actions: Action[],
        options?: AddOperationOptions
    ): Promise<IOperationResult>;

    abstract addDriveAction(
        drive: string,
        action: DocumentDriveAction | BaseAction,
        options?: AddOperationOptions
    ): Promise<IOperationResult<DocumentDriveDocument>>;
    abstract addDriveActions(
        drive: string,
        actions: (DocumentDriveAction | BaseAction)[],
        options?: AddOperationOptions
    ): Promise<IOperationResult<DocumentDriveDocument>>;

    abstract getSyncStatus(
        syncUnitId: string
    ): SyncStatus | SynchronizationUnitNotFoundError;

    /** Synchronization methods */
    abstract getSynchronizationUnits(
        driveId: string,
        documentId?: string[],
        scope?: string[],
        branch?: string[],
        documentType?: string[],
        loadedDrive?: DocumentDriveDocument
    ): Promise<SynchronizationUnit[]>;

    abstract getSynchronizationUnit(
        driveId: string,
        syncId: string,
        loadedDrive?: DocumentDriveDocument
    ): Promise<SynchronizationUnit | undefined>;

    abstract getSynchronizationUnitsIds(
        driveId: string,
        documentId?: string[],
        scope?: string[],
        branch?: string[],
        documentType?: string[]
    ): Promise<SynchronizationUnitQuery[]>;

    abstract getOperationData(
        driveId: string,
        syncId: string,
        filter: GetStrandsOptions,
        loadedDrive?: DocumentDriveDocument
    ): Promise<OperationUpdate[]>;

    /** Internal methods **/
    protected abstract createDocument(
        drive: string,
        document: CreateDocumentInput
    ): Promise<Document>;
    protected abstract deleteDocument(drive: string, id: string): Promise<void>;

    protected abstract getDocumentModel(documentType: string): DocumentModel;

    /** Event methods **/
    protected abstract emit<K extends keyof DriveEvents>(
        this: this,
        event: K,
        ...args: Parameters<DriveEvents[K]>
    ): void;
    abstract on<K extends keyof DriveEvents>(
        this: this,
        event: K,
        cb: DriveEvents[K]
    ): Unsubscribe;

    abstract getTransmitter(
        driveId: string,
        listenerId: string
    ): Promise<ITransmitter | undefined>;

    abstract clearStorage(): Promise<void>;

    abstract registerPullResponderTrigger(
        id: string,
        url: string,
        options: Pick<RemoteDriveOptions, 'pullFilter' | 'pullInterval'>
    ): Promise<PullResponderTrigger>;
}

export type ListenerManagerOptions = {
    sequentialUpdates?: boolean;
};

export const DefaultListenerManagerOptions = {
    sequentialUpdates: true
};

export type IBaseDocumentDriveServer = Pick<
    AbstractDocumentDriveServer,
    keyof AbstractDocumentDriveServer
>;

export type IDocumentDriveServer = IBaseDocumentDriveServer &
    IReadMoveDriveServer;

export abstract class BaseListenerManager {
    protected drive: IBaseDocumentDriveServer;
    protected listenerState = new Map<string, Map<string, ListenerState>>();
    protected options: ListenerManagerOptions;
    protected transmitters: Record<
        DocumentDriveState['id'],
        Record<Listener['listenerId'], ITransmitter>
    > = {};

    constructor(
        drive: IBaseDocumentDriveServer,
        listenerState = new Map<string, Map<string, ListenerState>>(),
        options: ListenerManagerOptions = DefaultListenerManagerOptions
    ) {
        this.drive = drive;
        this.listenerState = listenerState;
        this.options = { ...DefaultListenerManagerOptions, ...options };
    }

    abstract initDrive(drive: DocumentDriveDocument): Promise<void>;
    abstract removeDrive(driveId: DocumentDriveState['id']): Promise<void>;

    abstract driveHasListeners(driveId: string): boolean;
    abstract addListener(listener: Listener): Promise<ITransmitter>;
    abstract removeListener(
        driveId: string,
        listenerId: string
    ): Promise<boolean>;
    abstract getListener(
        driveId: string,
        listenerId: string
    ): Promise<ListenerState | undefined>;

    abstract getTransmitter(
        driveId: string,
        listenerId: string
    ): Promise<ITransmitter | undefined>;

    abstract getStrands(
        driveId: string,
        listenerId: string,
        options?: GetStrandsOptions
    ): Promise<StrandUpdate[]>;

    abstract updateSynchronizationRevisions(
        driveId: string,
        syncUnits: SynchronizationUnit[],
        source: StrandUpdateSource,
        willUpdate?: (listeners: Listener[]) => void,
        onError?: (
            error: Error,
            driveId: string,
            listener: ListenerState
        ) => void
    ): Promise<ListenerUpdate[]>;

    abstract updateListenerRevision(
        listenerId: string,
        driveId: string,
        syncId: string,
        listenerRev: number
    ): Promise<void>;
}

export type ListenerStatus =
    | 'CREATED'
    | 'PENDING'
    | 'SUCCESS'
    | 'MISSING'
    | 'CONFLICT'
    | 'ERROR';

export interface ListenerState {
    driveId: string;
    block: boolean;
    pendingTimeout: string;
    listener: Listener;
    syncUnits: Map<SynchronizationUnit['syncId'], SyncronizationUnitState>;
    listenerStatus: ListenerStatus;
}

export interface SyncronizationUnitState {
    listenerRev: number;
    lastUpdated: string;
}
