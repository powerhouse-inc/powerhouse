import {
  type DocumentDriveAction,
  type DocumentDriveDocument,
  type DocumentDriveLocalState,
  type ListenerCallInfo,
  type ListenerFilter,
  type Trigger,
} from "#drive-document-model/gen/types";
import { type IReadModeDriveServer } from "#read-mode/types";
import { type IDefaultDrivesManager } from "#utils/default-drives-manager";
import { type DriveInfo } from "#utils/graphql";
import { type RunAsap } from "#utils/run-asap";
import {
  type Action,
  type ActionContext,
  type CreateChildDocumentInput,
  type DocumentModelModule,
  type Operation,
  type OperationFromDocument,
  type OperationScope,
  type PHDocument,
  type ReducerOptions,
  type Signal,
} from "document-model";
import { type Unsubscribe } from "nanoevents";
import { type BaseDocumentDriveServer } from "./base-server.js";
import {
  type OperationError,
  type SynchronizationUnitNotFoundError,
} from "./error.js";
import {
  type ITransmitter,
  type StrandUpdateSource,
} from "./listener/transmitter/types.js";

export type Constructor<T = object> = new (...args: any[]) => T;

// Mixin type that returns a type extending both the base class and the interface
export type Mixin<T extends Constructor, I> = T &
  Constructor<InstanceType<T> & I>;

export type DocumentDriveServerMixin<I> = Mixin<
  typeof BaseDocumentDriveServer,
  I
>;

export type DriveInput = {
  global: {
    name: string;
    icon?: string | null;
  };
  id?: string;
  slug?: string;
  preferredEditor?: string;
  local?: Partial<DocumentDriveLocalState>;
};

export type RemoteDriveAccessLevel = "READ" | "WRITE";

export type RemoteDriveOptions = DocumentDriveLocalState & {
  // TODO make local state optional
  pullFilter?: ListenerFilter;
  pullInterval?: number;
  expectedDriveInfo?: DriveInfo;
  accessLevel?: RemoteDriveAccessLevel;
};

export type CreateDocumentInput<TDocument extends PHDocument> =
  CreateChildDocumentInput<TDocument>;

export type SignalResult = {
  signal: Signal;
  result: unknown; // infer from return types on document-model
};

export type IOperationResult<TDocument extends PHDocument = PHDocument> = {
  status: UpdateStatus;
  error?: OperationError;
  operations: OperationFromDocument<TDocument>[];
  document: TDocument | undefined;
  signals: SignalResult[];
};

export type DriveOperationResult = IOperationResult<DocumentDriveDocument>;

export type SynchronizationUnit = {
  syncId: string;
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
  transmitter?: ITransmitter;
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
  documentModelModules: (documentModelModules: DocumentModelModule[]) => void;
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
  source?: StrandUpdateSource;
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
  defaultDrives?: {
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
  jwtHandler?: (
    driveUrl: string,
    address: string | undefined,
    refresh?: boolean,
  ) => Promise<string>;
};

export type GetStrandsOptions = {
  limit?: number;
  since?: string;
  fromRevision?: number;
};

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

export interface IBaseDocumentDriveServer {
  initialize(): Promise<Error[] | null>;

  // todo: remove this once we have DI
  get listeners(): IListenerManager;

  setDocumentModelModules(models: DocumentModelModule[]): void;
  getDrives(): Promise<string[]>;
  addDrive(
    input: DriveInput,
    preferredEditor?: string,
  ): Promise<DocumentDriveDocument>;
  addRemoteDrive(
    url: string,
    options: RemoteDriveOptions,
  ): Promise<DocumentDriveDocument>;
  deleteDrive(driveId: string): Promise<void>;
  getDrive(
    driveId: string,
    options?: GetDocumentOptions,
  ): Promise<DocumentDriveDocument>;

  getDriveBySlug(slug: string): Promise<DocumentDriveDocument>;
  getDriveIdBySlug(
    slug: string,
  ): Promise<DocumentDriveDocument["header"]["id"]>;

  getDocuments(driveId: string): Promise<string[]>;
  getDocument<TDocument extends PHDocument>(
    driveId: string,
    documentId: string,
    options?: GetDocumentOptions,
  ): Promise<TDocument>;

  addOperation(
    driveId: string,
    documentId: string,
    operation: Operation,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  addOperations(
    driveId: string,
    documentId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  queueOperation(
    driveId: string,
    documentId: string,
    operation: Operation,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  queueOperations(
    driveId: string,
    documentId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  queueAction(
    driveId: string,
    documentId: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  queueActions(
    driveId: string,
    documentId: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  addDriveOperation(
    driveId: string,
    operation: Operation<DocumentDriveAction>,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;

  addDriveOperations(
    driveId: string,
    operations: Operation<DocumentDriveAction>[],
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;

  queueDriveOperation(
    driveId: string,
    operation: Operation<DocumentDriveAction>,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;

  queueDriveOperations(
    driveId: string,
    operations: Operation<DocumentDriveAction>[],
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;

  queueDriveAction(
    driveId: string,
    action: DocumentDriveAction,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  queueDriveActions(
    driveId: string,
    actions: DocumentDriveAction[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  addAction(
    driveId: string,
    documentId: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;
  addActions(
    driveId: string,
    documentId: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  addDriveAction(
    driveId: string,
    action: DocumentDriveAction,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;
  addDriveActions(
    driveId: string,
    actions: DocumentDriveAction[],
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;

  getSyncStatus(
    syncUnitId: string,
  ): SyncStatus | SynchronizationUnitNotFoundError;

  /** Synchronization methods */
  getSynchronizationUnits(
    driveId: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
  ): Promise<SynchronizationUnit[]>;

  getSynchronizationUnit(
    driveId: string,
    syncId: string,
    loadedDrive?: DocumentDriveDocument,
  ): Promise<SynchronizationUnit | undefined>;

  getSynchronizationUnitsIds(
    driveId: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
  ): Promise<SynchronizationUnitQuery[]>;

  getOperationData(
    driveId: string,
    syncId: string,
    filter: GetStrandsOptions,
  ): Promise<OperationUpdate[]>;

  /** Internal methods **/
  getDocumentModelModules(): DocumentModelModule[];

  on<K extends keyof DriveEvents>(event: K, cb: DriveEvents[K]): Unsubscribe;

  setGenerateJwtHandler(handler: (driveUrl: string) => Promise<string>): void;
  removeJwtHandler(): void;
  generateJwtHandler?: (driveUrl: string) => Promise<string>;
}

export type IDocumentDriveServer = IBaseDocumentDriveServer &
  IDefaultDrivesManager &
  IReadModeDriveServer;

export type DriveUpdateErrorHandler = (
  error: Error,
  driveId: string,
  listener: ListenerState,
) => void;

export interface IListenerManager {
  initialize(handler: DriveUpdateErrorHandler): Promise<void>;

  removeDrive(driveId: DocumentDriveDocument["header"]["id"]): Promise<void>;
  driveHasListeners(driveId: string): boolean;

  setListener(driveId: string, listener: Listener): Promise<void>;
  removeListener(driveId: string, listenerId: string): Promise<boolean>;
  getListenerState(driveId: string, listenerId: string): ListenerState;

  getStrands(
    driveId: string,
    listenerId: string,
    options?: GetStrandsOptions,
  ): Promise<StrandUpdate[]>;
  updateSynchronizationRevisions(
    driveId: string,
    syncUnits: SynchronizationUnit[],
    source: StrandUpdateSource,
    willUpdate?: (listeners: Listener[]) => void,
    onError?: (error: Error, driveId: string, listener: ListenerState) => void,
    forceSync?: boolean,
  ): Promise<ListenerUpdate[]>;
  updateListenerRevision(
    listenerId: string,
    driveId: string,
    syncId: string,
    listenerRev: number,
  ): Promise<void>;

  // todo: re-evaluate
  getListenerSyncUnitIds(
    driveId: string,
    listenerId: string,
  ): Promise<SynchronizationUnitQuery[]>;
  removeSyncUnits(
    driveId: string,
    syncUnits: Pick<SynchronizationUnit, "syncId">[],
  ): Promise<void>;

  setGenerateJwtHandler(handler: (driveUrl: string) => Promise<string>): void;
  removeJwtHandler(): void;
  generateJwtHandler?: (driveUrl: string) => Promise<string>;
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

export interface ITransmitterFactory {
  instance(
    transmitterType: string,
    listener: Listener,
    driveServer: IBaseDocumentDriveServer,
  ): ITransmitter;
}

export interface IEventEmitter {
  emit<K extends keyof DriveEvents>(
    event: K,
    ...args: Parameters<DriveEvents[K]>
  ): void;

  on<K extends keyof DriveEvents>(event: K, cb: DriveEvents[K]): Unsubscribe;
}

export interface ISynchronizationManager {
  setDocumentModelModules(arg0: DocumentModelModule[]): void;
  getSynchronizationUnits(
    driveId: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
  ): Promise<SynchronizationUnit[]>;

  getSynchronizationUnitsIds(
    driveId: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
  ): Promise<SynchronizationUnitQuery[]>;

  getSynchronizationUnit(
    driveId: string,
    syncId: string,
  ): Promise<SynchronizationUnit | undefined>;

  getOperationData(
    driveId: string,
    syncId: string,
    filter: GetStrandsOptions,
  ): Promise<OperationUpdate[]>;

  getSynchronizationUnitsRevision(
    driveId: string,
    syncUnitsQuery: SynchronizationUnitQuery[],
  ): Promise<SynchronizationUnit[]>;

  // New sync status methods
  getSyncStatus(
    syncUnitId: string,
  ): SyncStatus | SynchronizationUnitNotFoundError;

  updateSyncStatus(
    syncUnitId: string,
    status: Partial<SyncUnitStatusObject> | null,
    error?: Error,
  ): void;

  initializeDriveSyncStatus(
    driveId: string,
    drive: DocumentDriveDocument,
  ): Promise<void>;

  getCombinedSyncUnitStatus(syncUnitStatus: SyncUnitStatusObject): SyncStatus;
}
