import type {
    DocumentDriveAction,
    DocumentDriveDocument,
    DocumentDriveLocalState,
    DocumentDriveState,
    ListenerCallInfo,
    ListenerFilter
} from 'document-model-libs/document-drive';
import type {
    Action,
    ActionContext,
    BaseAction,
    CreateChildDocumentInput,
    Document,
    Operation,
    OperationScope,
    ReducerOptions,
    Signal,
    State
} from 'document-model/document';
import { Unsubscribe } from 'nanoevents';
import { OperationError } from './error';
import { ITransmitter } from './listener/transmitter/types';

export type DriveInput = State<
    Omit<DocumentDriveState, '__typename' | 'id' | 'nodes'> & { id?: string },
    DocumentDriveLocalState
>;

export type RemoteDriveOptions = DocumentDriveLocalState & {
    // TODO make local state optional
    pullFilter?: ListenerFilter;
    pullInterval?: number;
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

export type SyncStatus = 'SYNCING' | UpdateStatus;

export interface DriveEvents {
    syncStatus: (driveId: string, status: SyncStatus, error?: Error) => void;
    strandUpdate: (update: StrandUpdate) => void;
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

export abstract class BaseDocumentDriveServer {
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

    abstract getDriveBySlug(
        slug: string,
    ): Promise<DocumentDriveDocument>;

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
        forceSync?: boolean
    ): Promise<IOperationResult>;
    abstract addOperations(
        drive: string,
        id: string,
        operations: Operation[],
        forceSync?: boolean
    ): Promise<IOperationResult>;

    abstract queueOperation(
        drive: string,
        id: string,
        operation: Operation,
        forceSync?: boolean
    ): Promise<IOperationResult>;
    abstract queueOperations(
        drive: string,
        id: string,
        operations: Operation[],
        forceSync?: boolean
    ): Promise<IOperationResult>;

    abstract addDriveOperation(
        drive: string,
        operation: Operation<DocumentDriveAction | BaseAction>,
        forceSync?: boolean
    ): Promise<IOperationResult<DocumentDriveDocument>>;
    abstract addDriveOperations(
        drive: string,
        operations: Operation<DocumentDriveAction | BaseAction>[],
        forceSync?: boolean
    ): Promise<IOperationResult<DocumentDriveDocument>>;

    abstract queueDriveOperation(
        drive: string,
        operation: Operation<DocumentDriveAction | BaseAction>,
        forceSync?: boolean
    ): Promise<IOperationResult<DocumentDriveDocument>>;
    abstract queueDriveOperations(
        drive: string,
        operations: Operation<DocumentDriveAction | BaseAction>[],
        forceSync?: boolean
    ): Promise<IOperationResult<DocumentDriveDocument>>;

    abstract addAction(
        drive: string,
        id: string,
        action: Action
    ): Promise<IOperationResult>;
    abstract addActions(
        drive: string,
        id: string,
        actions: Action[]
    ): Promise<IOperationResult>;

    abstract addDriveAction(
        drive: string,
        action: DocumentDriveAction | BaseAction
    ): Promise<IOperationResult<DocumentDriveDocument>>;
    abstract addDriveActions(
        drive: string,
        actions: (DocumentDriveAction | BaseAction)[]
    ): Promise<IOperationResult<DocumentDriveDocument>>;

    abstract getSyncStatus(drive: string): SyncStatus;

    /** Synchronization methods */
    abstract getSynchronizationUnits(
        driveId: string,
        documentId?: string[],
        scope?: string[],
        branch?: string[],
        documentType?: string[]
    ): Promise<SynchronizationUnit[]>;

    abstract getSynchronizationUnit(
        driveId: string,
        syncId: string
    ): Promise<SynchronizationUnit>;

    abstract getOperationData(
        driveId: string,
        syncId: string,
        filter: {
            since?: string;
            fromRevision?: number;
        }
    ): Promise<OperationUpdate[]>;

    /** Internal methods **/
    protected abstract createDocument(
        drive: string,
        document: CreateDocumentInput
    ): Promise<Document>;
    protected abstract deleteDocument(drive: string, id: string): Promise<void>;

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
}

export abstract class BaseListenerManager {
    protected drive: BaseDocumentDriveServer;
    protected listenerState = new Map<string, Map<string, ListenerState>>();
    protected transmitters: Record<
        DocumentDriveState['id'],
        Record<Listener['listenerId'], ITransmitter>
    > = {};

    constructor(
        drive: BaseDocumentDriveServer,
        listenerState = new Map<string, Map<string, ListenerState>>()
    ) {
        this.drive = drive;
        this.listenerState = listenerState;
    }

    abstract initDrive(drive: DocumentDriveDocument): Promise<void>;

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
        listenerId: string,
        since?: string
    ): Promise<StrandUpdate[]>;

    abstract updateSynchronizationRevisions(
        driveId: string,
        syncUnits: SynchronizationUnit[],
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

export type IDocumentDriveServer = Pick<
    BaseDocumentDriveServer,
    keyof BaseDocumentDriveServer
>;

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
