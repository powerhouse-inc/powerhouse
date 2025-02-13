import type {
  DocumentDriveAction,
  DocumentDriveDocument,
  DocumentDriveLocalState,
  DocumentDriveState,
  ListenerCallInfo,
  ListenerFilter,
  Trigger,
} from "@drive-document-model";
import { IReadModeDriveServer } from "@read-mode/types";
import { BaseDocumentDriveServer } from "@server/base";
import {
  OperationError,
  SynchronizationUnitNotFoundError,
} from "@server/error";
import {
  IReceiver as IInternalListener,
  IInternalTransmitter,
} from "@server/listener/transmitter/internal";
import {
  ITransmitter,
  PullResponderTrigger,
  StrandUpdateSource,
} from "@server/listener/transmitter/types";
import { IDefaultDrivesManager } from "@utils/default-drives-manager";
import { DriveInfo } from "@utils/graphql";
import { RunAsap } from "@utils/run-asap";
import type {
  Action,
  ActionContext,
  BaseDocument,
  BaseState,
  CreateChildDocumentInput,
  DocumentModelModule,
  Operation,
  OperationScope,
  ReducerOptions,
  Signal,
} from "document-model";
import { Unsubscribe } from "nanoevents";

export type Constructor<T = object> = new (...args: any[]) => T;

export type DocumentDriveServerConstructor =
  Constructor<BaseDocumentDriveServer>;

// Mixin type that returns a type extending both the base class and the interface
export type Mixin<T extends Constructor, I> = T &
  Constructor<InstanceType<T> & I>;

export type DocumentDriveServerMixin<I> = Mixin<
  typeof BaseDocumentDriveServer,
  I
>;

export type DriveInput = BaseState<
  Omit<DocumentDriveState, "__typename" | "id" | "nodes"> & { id?: string },
  DocumentDriveLocalState
>;

export type RemoteDriveAccessLevel = "READ" | "WRITE";

export type RemoteDriveOptions = DocumentDriveLocalState & {
  // TODO make local state optional
  pullFilter?: ListenerFilter;
  pullInterval?: number;
  expectedDriveInfo?: DriveInfo;
  accessLevel?: RemoteDriveAccessLevel;
};

export type CreateDocumentInput = CreateChildDocumentInput<
  DocumentDriveState,
  DocumentDriveLocalState
>;

export type SignalResult = {
  signal: Signal<DocumentDriveState, DocumentDriveLocalState>;
  result: unknown; // infer from return types on document-model
};

export type IOperationResult<TGlobalState, TLocalState> = {
  status: UpdateStatus;
  error?: OperationError<TGlobalState, TLocalState>;
  operations: Operation<TGlobalState, TLocalState>[];
  document: BaseDocument<TGlobalState, TLocalState> | undefined;
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
  "revision" | "lastUpdated"
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
  RESTWebhook,
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

export type ListenerRevisionWithError = Omit<ListenerRevision, "error"> & {
  error?: Error;
};

export type ListenerUpdate = {
  listenerId: string;
  listenerRevisions: ListenerRevision[];
};

export type UpdateStatus = "SUCCESS" | "CONFLICT" | "MISSING" | "ERROR";
export type ErrorStatus = Exclude<UpdateStatus, "SUCCESS">;

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

export type SyncStatus = "INITIAL_SYNC" | "SYNCING" | UpdateStatus;

export type PullSyncStatus = SyncStatus;
export type PushSyncStatus = SyncStatus;

export type SyncUnitStatusObject = {
  push?: PushSyncStatus;
  pull?: PullSyncStatus;
};

export type AddRemoteDriveStatus =
  | "SUCCESS"
  | "ERROR"
  | "PENDING"
  | "ADDING"
  | "ALREADY_ADDED";

export interface DriveEvents {
  syncStatus: (
    driveId: string,
    status: SyncStatus,
    error?: Error,
    syncUnitStatus?: SyncUnitStatusObject,
  ) => void;
  defaultRemoteDrive: (
    status: AddRemoteDriveStatus,
    defaultDrives: Map<string, DefaultRemoteDriveInfo>,
    driveInput: DefaultRemoteDriveInput,
    driveId?: string,
    driveName?: string,
    error?: Error,
  ) => void;
  strandUpdate: (update: StrandUpdate) => void;
  clientStrandsError: (
    driveId: string,
    trigger: Trigger,
    status: number,
    errorMessage: string,
  ) => void;
  documentModels: (
    documentModels: DocumentModelModule<
      DocumentDriveState,
      DocumentDriveLocalState,
      DocumentDriveAction
    >[],
  ) => void;
  driveAdded: (drive: DocumentDriveDocument) => void;
  driveDeleted: (driveId: string) => void;
}

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

export type RemoveDriveStrategy = "remove" | "detach";

/**
 * Options for removing old remote drives.
 *
 * Allows specifying different strategies for handling old remote drives:
 *
 * - `remove-all`: Remove all remote drives.
 * - `preserve-all`: Preserve all remote drives (this is the default behavior).
 * - `remove-by-id`: Remove the remote drives specified by their IDs.
 * - `remove-by-url`: Remove the remote drives specified by their URLs.
 * - `preserve-by-id`: Preserve remote drives by their IDs and remove the rest.
 * - `preserve-by-url`: Preserve remote drives by their URLs and remove the rest.
 * - `detach-by-id`: Detach remote drives by their IDs (changes the remote drive to a local drive).
 * - `detach-by-url`: Detach remote drives by their URLs (changes the remote drive to a local drive).
 * - `preserve-by-id-and-detach`: Preserve the remote drives specified by their IDs and detach the rest.
 * - `preserve-by-url-and-detach`: Preserve the remote drives specified by their URLs and detach the rest.
 *
 * Each strategy is represented by an object with a `strategy` property and,
 * depending on the strategy, additional properties such as `ids` or `urls`.
 */
export type RemoveOldRemoteDrivesOption =
  | {
      strategy: "remove-all";
    }
  | {
      strategy: "preserve-all";
    }
  | {
      strategy: "remove-by-id";
      ids: string[];
    }
  | {
      strategy: "remove-by-url";
      urls: string[];
    }
  | {
      strategy: "preserve-by-id";
      ids: string[];
    }
  | {
      strategy: "preserve-by-url";
      urls: string[];
    }
  | {
      strategy: "detach-by-id";
      ids: string[];
    }
  | {
      strategy: "detach-by-url";
      urls: string[];
    }
  | {
      strategy: "preserve-by-id-and-detach";
      ids: string[];
    }
  | {
      strategy: "preserve-by-url-and-detach";
      urls: string[];
    };

export type DocumentDriveServerOptions = {
  defaultDrives: {
    loadOnInit?: boolean; // defaults to true
    remoteDrives?: Array<DefaultRemoteDriveInput>;
    removeOldRemoteDrives?: RemoveOldRemoteDrivesOption;
  };
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
  abstract initialize(): Promise<Error[] | null>;
  abstract setDocumentModels(
    models: DocumentModelModule<
      DocumentDriveState,
      DocumentDriveLocalState,
      DocumentDriveAction
    >[],
  ): void;
  abstract getDrives(): Promise<string[]>;
  abstract addDrive(drive: DriveInput): Promise<DocumentDriveDocument>;
  abstract addRemoteDrive(
    url: string,
    options: RemoteDriveOptions,
  ): Promise<DocumentDriveDocument>;
  abstract deleteDrive(id: string): Promise<void>;
  abstract getDrive(
    id: string,
    options?: GetDocumentOptions,
  ): Promise<DocumentDriveDocument>;

  abstract getDriveBySlug(slug: string): Promise<DocumentDriveDocument>;

  abstract getDocuments(drive: string): Promise<string[]>;
  abstract getDocument<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    options?: GetDocumentOptions,
  ): Promise<BaseDocument<TGlobalState, TLocalState>>;

  abstract addOperation<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    operation: Operation<TGlobalState, TLocalState>,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<TGlobalState, TLocalState>>;

  abstract addOperations<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    operations: Operation<TGlobalState, TLocalState>[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult<TGlobalState, TLocalState>>;

  abstract queueOperation<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    operation: Operation<TGlobalState, TLocalState>,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<TGlobalState, TLocalState>>;

  abstract queueOperations<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    operations: Operation<TGlobalState, TLocalState>[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult<TGlobalState, TLocalState>>;

  abstract queueAction<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<TGlobalState, TLocalState>>;

  abstract queueActions<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult<TGlobalState, TLocalState>>;

  abstract addDriveOperation(
    drive: string,
    operation: Operation<DocumentDriveState, DocumentDriveLocalState>,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveState, DocumentDriveLocalState>>;
  abstract addDriveOperations(
    drive: string,
    operations: Operation<DocumentDriveState, DocumentDriveLocalState>[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveState, DocumentDriveLocalState>>;

  abstract queueDriveOperation<TGlobalState, TLocalState>(
    drive: string,
    operation: Operation<TGlobalState, TLocalState>,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<TGlobalState, TLocalState>>;

  abstract queueDriveOperations<TGlobalState, TLocalState>(
    drive: string,
    operations: Operation<TGlobalState, TLocalState>[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult<TGlobalState, TLocalState>>;

  abstract queueDriveAction<TGlobalState, TLocalState>(
    drive: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<TGlobalState, TLocalState>>;

  abstract queueDriveActions<TGlobalState, TLocalState>(
    drive: string,
    actions: Array<DocumentDriveAction | Action>,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<TGlobalState, TLocalState>>;

  abstract addAction<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<TGlobalState, TLocalState>>;
  abstract addActions<TGlobalState, TLocalState>(
    drive: string,
    id: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult<TGlobalState, TLocalState>>;

  abstract addDriveAction(
    drive: string,
    action: DocumentDriveAction | Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveState, DocumentDriveLocalState>>;
  abstract addDriveActions(
    drive: string,
    actions: (DocumentDriveAction | Action)[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveState, DocumentDriveLocalState>>;

  abstract getSyncStatus(
    syncUnitId: string,
  ): SyncStatus | SynchronizationUnitNotFoundError;

  abstract addInternalListener(
    driveId: string,
    receiver: IInternalListener,
    options: {
      listenerId: string;
      label: string;
      block: boolean;
      filter: ListenerFilter;
    },
  ): Promise<IInternalTransmitter>;

  /** Synchronization methods */
  abstract getSynchronizationUnits(
    driveId: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
    loadedDrive?: DocumentDriveDocument,
  ): Promise<SynchronizationUnit[]>;

  abstract getSynchronizationUnit(
    driveId: string,
    syncId: string,
    loadedDrive?: DocumentDriveDocument,
  ): Promise<SynchronizationUnit | undefined>;

  abstract getSynchronizationUnitsIds(
    driveId: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
  ): Promise<SynchronizationUnitQuery[]>;

  abstract getOperationData(
    driveId: string,
    syncId: string,
    filter: GetStrandsOptions,
    loadedDrive?: DocumentDriveDocument,
  ): Promise<OperationUpdate[]>;

  /** Internal methods **/
  protected abstract createDocument(
    drive: string,
    document: CreateDocumentInput,
  ): Promise<Document>;
  protected abstract deleteDocument(drive: string, id: string): Promise<void>;

  protected abstract getDocumentModel<
    TGlobalState,
    TLocalState,
    ,
  >(
    documentType: string,
  ): DocumentModelModule<TGlobalState, TLocalState, TAction>;
  abstract getDocumentModels<
    TGlobalState,
    TLocalState,
    ,
  >(): DocumentModelModule<TGlobalState, TLocalState, TAction>[];

  /** Event methods **/
  protected abstract emit<K extends keyof DriveEvents>(
    event: K,
    ...args: Parameters<DriveEvents[K]>
  ): void;
  abstract on<K extends keyof DriveEvents>(
    event: K,
    cb: DriveEvents[K],
  ): Unsubscribe;

  abstract getTransmitter(
    driveId: string,
    listenerId: string,
  ): Promise<ITransmitter | undefined>;

  abstract clearStorage(): Promise<void>;

  abstract registerPullResponderTrigger(
    id: string,
    url: string,
    options: Pick<RemoteDriveOptions, "pullFilter" | "pullInterval">,
  ): Promise<PullResponderTrigger>;
}

export type ListenerManagerOptions = {
  sequentialUpdates?: boolean;
};

export const DefaultListenerManagerOptions = {
  sequentialUpdates: true,
};

type PublicKeys<T> = {
  [K in keyof T]: T extends { [P in K]: T[K] } ? K : never;
}[keyof T];

type PublicPart<T> = Pick<T, PublicKeys<T>>;

export type IBaseDocumentDriveServer = PublicPart<AbstractDocumentDriveServer>;

export type IDocumentDriveServer = IBaseDocumentDriveServer &
  IDefaultDrivesManager &
  IReadModeDriveServer;

export abstract class BaseListenerManager {
  protected drive: IBaseDocumentDriveServer;
  protected listenerState = new Map<string, Map<string, ListenerState>>();
  protected options: ListenerManagerOptions;
  protected transmitters: Record<
    DocumentDriveState["id"],
    Record<Listener["listenerId"], ITransmitter>
  > = {};

  constructor(
    drive: IBaseDocumentDriveServer,
    listenerState = new Map<string, Map<string, ListenerState>>(),
    options: ListenerManagerOptions = DefaultListenerManagerOptions,
  ) {
    this.drive = drive;
    this.listenerState = listenerState;
    this.options = { ...DefaultListenerManagerOptions, ...options };
  }

  abstract initDrive(drive: DocumentDriveDocument): Promise<void>;
  abstract removeDrive(driveId: DocumentDriveState["id"]): Promise<void>;

  abstract driveHasListeners(driveId: string): boolean;
  abstract addListener(listener: Listener): Promise<ITransmitter>;
  abstract removeListener(
    driveId: string,
    listenerId: string,
  ): Promise<boolean>;
  abstract getListener(
    driveId: string,
    listenerId: string,
  ): Promise<ListenerState | undefined>;

  abstract getTransmitter(
    driveId: string,
    listenerId: string,
  ): Promise<ITransmitter | undefined>;

  abstract getStrands(
    driveId: string,
    listenerId: string,
    options?: GetStrandsOptions,
  ): Promise<StrandUpdate[]>;

  abstract updateSynchronizationRevisions(
    driveId: string,
    syncUnits: SynchronizationUnit[],
    source: StrandUpdateSource,
    willUpdate?: (listeners: Listener[]) => void,
    onError?: (error: Error, driveId: string, listener: ListenerState) => void,
  ): Promise<ListenerUpdate[]>;

  abstract updateListenerRevision(
    listenerId: string,
    driveId: string,
    syncId: string,
    listenerRev: number,
  ): Promise<void>;
}

export type ListenerStatus =
  | "CREATED"
  | "PENDING"
  | "SUCCESS"
  | "MISSING"
  | "CONFLICT"
  | "ERROR";

export interface ListenerState {
  driveId: string;
  block: boolean;
  pendingTimeout: string;
  listener: Listener;
  syncUnits: Map<SynchronizationUnit["syncId"], SyncronizationUnitState>;
  listenerStatus: ListenerStatus;
}

export interface SyncronizationUnitState {
  listenerRev: number;
  lastUpdated: string;
}
