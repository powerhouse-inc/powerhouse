import {
  type DocumentDriveAction,
  type DocumentDriveDocument,
  type DocumentDriveLocalState,
  type LegacyAddFileAction,
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
  type DocumentModelModule,
  type Operation,
  type OperationFromDocument,
  type OperationScope,
  type PHDocument,
  type PHDocumentHeader,
  type PHDocumentMeta,
  type ReducerOptions,
} from "document-model";
import { type Unsubscribe } from "nanoevents";
import { type SignalResult } from "../../../document-model/src/document/signal.js";
import { type BaseDocumentDriveServer } from "./base-server.js";
import {
  type OperationError,
  type SynchronizationUnitNotFoundError,
} from "./error.js";
import {
  type ITransmitter,
  type StrandUpdateSource,
} from "./listener/transmitter/types.js";
import { type ISyncUnitMap } from "./sync-unit-map.js";

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

/**
 * @deprecated In the future we will disallow this. Use the header field instead.
 */
export type LegacyCreateDocumentInput = {
  /**
   * @deprecated In the future we will disallow this. Use the header field instead.
   */
  id: string;
  documentType: string;
};

export type CreateDocumentInputWithDocument<TDocument extends PHDocument> = {
  document: TDocument;
};

export type CreateDocumentInputWithHeader = {
  header: PHDocumentHeader;
};

export type CreateDocumentInputWithDocumentId = {
  documentType: string;
};

export type CreateDocumentInput<TDocument extends PHDocument> =
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  | LegacyCreateDocumentInput
  | CreateDocumentInputWithDocument<TDocument>
  | CreateDocumentInputWithHeader
  | CreateDocumentInputWithDocumentId;

export type IOperationResult<TDocument extends PHDocument = PHDocument> = {
  status: UpdateStatus;
  error?: OperationError;
  operations: OperationFromDocument<TDocument>[];
  document: TDocument | undefined;
  signals: SignalResult[];
};

export type DriveOperationResult = IOperationResult<DocumentDriveDocument>;

export type SynchronizationUnitId = {
  documentId: string;
  scope: string;
  branch: string;
};

export type SynchronizationUnit = SynchronizationUnitId & {
  documentType: string;
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
  documentType: string;
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
  documentType: string;
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
    scope?: string,
    branch?: string,
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
  documentOperationsAdded: (
    documentId: string,
    operations: Operation[],
  ) => void;
  driveOperationsAdded: (driveId: string, operations: Operation[]) => void;
  operationsAdded: (documentId: string, operations: Operation[]) => void;
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
  getDrivesSlugs(): Promise<string[]>;
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

  addDocument<TDocument extends PHDocument>(
    input: TDocument,
    meta?: PHDocumentMeta,
  ): Promise<TDocument>;
  deleteDocument(documentId: string): Promise<void>;

  getDocuments(parentId: string): Promise<string[]>;

  /**
   * @deprecated Use getDocument(documentId, options) instead. This method will be removed in the future.
   */
  getDocument<TDocument extends PHDocument>(
    driveId: string,
    documentId: string,
    options?: GetDocumentOptions,
  ): Promise<TDocument>;

  getDocument<TDocument extends PHDocument>(
    documentId: string,
    options?: GetDocumentOptions,
  ): Promise<TDocument>;

  queueDocument<TDocument extends PHDocument>(
    input: CreateDocumentInput<TDocument>,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  /**
   * @deprecated Use addOperation(documentId, operation, options) instead. This method will be removed in the future.
   */
  addOperation(
    driveId: string,
    documentId: string,
    operation: Operation,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;
  addOperation(
    documentId: string,
    operation: Operation,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  /**
   * @deprecated Use addOperations(documentId, operations, options) instead. This method will be removed in the future.
   */
  addOperations(
    driveId: string,
    documentId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;
  addOperations(
    documentId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  /**
   * @deprecated Use queueOperation(documentId, operation, options) instead. This method will be removed in the future.
   */
  queueOperation(
    driveId: string,
    documentId: string,
    operation: Operation,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;
  queueOperation(
    documentId: string,
    operation: Operation,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  /**
   * @deprecated Use queueOperations(documentId, operations, options) instead. This method will be removed in the future.
   */
  queueOperations(
    driveId: string,
    documentId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;
  queueOperations(
    documentId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  /**
   * @deprecated Use queueAction(documentId, action, options) instead. This method will be removed in the future.
   */
  queueAction(
    driveId: string,
    documentId: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;
  queueAction(
    documentId: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  /**
   * @deprecated Use queueActions(documentId, actions, options) instead. This method will be removed in the future.
   */
  queueActions(
    driveId: string,
    documentId: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;
  queueActions(
    documentId: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  /**
   * @deprecated Use the {@link addOperation} method instead.
   */
  addDriveOperation(
    driveId: string,
    operation: Operation<DocumentDriveAction>,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;

  /**
   * @deprecated Use the {@link addOperations} method instead.
   */
  addDriveOperations(
    driveId: string,
    operations: Operation<DocumentDriveAction>[],
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;

  /**
   * @deprecated Use the {@link queueOperation} method instead.
   */
  queueDriveOperation(
    driveId: string,
    operation: Operation<DocumentDriveAction>,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;

  /**
   * @deprecated Use the {@link queueOperations} method instead.
   */
  queueDriveOperations(
    driveId: string,
    operations: Operation<DocumentDriveAction>[],
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;

  /**
   * @deprecated Use the {@link queueAction} method instead.
   */
  queueDriveAction(
    driveId: string,
    action: DocumentDriveAction,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  /**
   * @deprecated Use the {@link queueActions} method instead.
   */
  queueDriveActions(
    driveId: string,
    actions: DocumentDriveAction[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  /**
   * @deprecated Use addAction(documentId, action, options) method instead. This method will be removed in the future.
   */
  addAction(
    driveId: string,
    documentId: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;
  addAction(
    documentId: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;
  /**
   * @deprecated Use addActions(documentId, actions, options) instead. This method will be removed in the future.
   */
  addActions(
    driveId: string,
    documentId: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;
  addActions(
    documentId: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult>;

  /**
   * @deprecated Use the {@link addAction} method with a {@link AddFileAction} and call {@link addDocument} if the document needs to be created.
   */
  addDriveAction(
    driveId: string,
    action: LegacyAddFileAction,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;

  /**
   * @deprecated Use the {@link addAction} method instead.
   */
  addDriveAction(
    driveId: string,
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    action: DocumentDriveAction,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;

  /**
   * @deprecated Use the {@link addActions} method instead.
   */
  addDriveActions(
    driveId: string,
    actions: DocumentDriveAction[],
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;

  getSyncStatus(
    documentId: string,
    scope?: string,
    branch?: string,
  ): SyncStatus | SynchronizationUnitNotFoundError;

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
    syncUnits: SynchronizationUnit[],
    source: StrandUpdateSource,
    willUpdate?: (listeners: Listener[]) => void,
    onError?: (error: Error, driveId: string, listener: ListenerState) => void,
    forceSync?: boolean,
  ): Promise<ListenerUpdate[]>;
  updateListenerRevision(
    listenerId: string,
    driveId: string,
    syncUnitId: SynchronizationUnitId,
    listenerRev: number,
  ): Promise<void>;
  removeSyncUnits(
    parentId: string,
    syncUnits: SynchronizationUnitId[],
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

export type SynchronizationUnitMap = ISyncUnitMap<SyncronizationUnitState>;

export interface ListenerState {
  driveId: string;
  block: boolean;
  pendingTimeout: string;
  listener: Listener;
  syncUnits: SynchronizationUnitMap;
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
    parentId?: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
  ): Promise<SynchronizationUnit[]>;

  getSynchronizationUnitsIds(
    parentId?: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
  ): Promise<SynchronizationUnitQuery[]>;

  getSynchronizationUnit(
    syncId: SynchronizationUnitId,
  ): Promise<SynchronizationUnit | undefined>;

  getOperationData(
    syncId: SynchronizationUnitId,
    filter: GetStrandsOptions,
  ): Promise<OperationUpdate[]>;

  // Overloaded sync status methods
  getSyncStatus(
    documentId: string,
    scope?: string,
    branch?: string,
  ): SyncStatus | SynchronizationUnitNotFoundError;
  getSyncStatus(
    syncId: SynchronizationUnitId,
  ): SyncStatus | SynchronizationUnitNotFoundError;

  // Overloaded sync status update methods
  updateSyncStatus(
    documentId: string,
    status: Partial<SyncUnitStatusObject> | null,
    error?: Error,
    scope?: string,
    branch?: string,
  ): void;
  updateSyncStatus(
    syncId: SynchronizationUnitId,
    status: Partial<SyncUnitStatusObject> | null,
    error?: Error,
  ): void;

  initializeDriveSyncStatus(
    driveId: string,
    drive: DocumentDriveDocument,
  ): Promise<void>;

  getCombinedSyncUnitStatus(syncUnitStatus: SyncUnitStatusObject): SyncStatus;
}
