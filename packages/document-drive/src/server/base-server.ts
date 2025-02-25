import { ICache } from "#cache/types";
import { RemoveListenerAction } from "#drive-document-model/gen/actions";
import {
  addListener,
  removeListener,
  removeTrigger,
  setSharingType,
} from "#drive-document-model/gen/creators";
import {
  AddListenerInput,
  DocumentDriveAction,
  DocumentDriveDocument,
  DocumentDriveState,
  ListenerFilter,
  Trigger,
} from "#drive-document-model/gen/types";
import { createDocument } from "#drive-document-model/gen/utils";
import {
  ActionJob,
  IQueueManager,
  Job,
  OperationJob,
  isActionJob,
  isOperationJob,
} from "#queue/types";
import { ReadModeServer } from "#read-mode/server";
import { IDriveStorage } from "#storage/types";
import {
  DefaultDrivesManager,
  IDefaultDrivesManager,
} from "#utils/default-drives-manager";
import { requestPublicDrive } from "#utils/graphql";
import { logger } from "#utils/logger";
import { generateUUID, isDocumentDrive, runAsapAsync } from "#utils/misc";
import { RunAsap } from "#utils/run-asap";
import {
  Action,
  DocumentHeader,
  DocumentModelModule,
  Operation,
  OperationScope,
  PHDocument,
  attachBranch,
  garbageCollect,
  garbageCollectDocumentOperations,
  groupOperationsByScope,
  merge,
  precedes,
  removeExistingOperations,
  replayDocument,
  reshuffleByTimestamp,
  skipHeaderOperations,
  sortOperations,
} from "document-model";
import { ClientError } from "graphql-request";
import { Unsubscribe } from "nanoevents";
import {
  ConflictOperationError,
  DriveAlreadyExistsError,
  OperationError,
  SynchronizationUnitNotFoundError,
} from "./error.js";
import {
  IReceiver,
  InternalTransmitter,
} from "./listener/transmitter/internal.js";
import {
  CancelPullLoop,
  PullResponderTransmitter,
} from "./listener/transmitter/pull-responder.js";
import {
  ITransmitter,
  StrandUpdateSource,
} from "./listener/transmitter/types.js";
import {
  AddOperationOptions,
  Constructor,
  CreateDocumentInput,
  DefaultListenerManagerOptions,
  DocumentDriveServerOptions,
  DriveEvents,
  DriveInput,
  DriveOperationResult,
  GetDocumentOptions,
  GetStrandsOptions,
  IBaseDocumentDriveServer,
  IEventEmitter,
  IListenerManager,
  IOperationResult,
  ISynchronizationManager,
  ITransmitterFactory,
  Listener,
  ListenerState,
  Mixin,
  OperationUpdate,
  RemoteDriveAccessLevel,
  RemoteDriveOptions,
  SignalResult,
  StrandUpdate,
  SyncStatus,
  SyncUnitStatusObject,
  SynchronizationUnit,
  SynchronizationUnitQuery,
} from "./types.js";
import { filterOperationsByRevision, isAtRevision } from "./utils.js";

export class BaseDocumentDriveServer
  implements IBaseDocumentDriveServer, IDefaultDrivesManager
{
  // external dependencies
  private documentModelModules: DocumentModelModule[];
  private storage: IDriveStorage;
  private cache: ICache;
  private queueManager: IQueueManager;
  private eventEmitter: IEventEmitter;
  protected options: Required<DocumentDriveServerOptions>;

  // waiting to move to external dependencies
  private listenerManager: IListenerManager;
  private transmitterFactory: ITransmitterFactory;
  private synchronizationManager: ISynchronizationManager;

  // internal dependencies
  private defaultDrivesManager: DefaultDrivesManager;

  // internal state
  private triggerMap = new Map<
    DocumentDriveState["id"],
    Map<Trigger["id"], CancelPullLoop>
  >();
  private initializePromise: Promise<Error[] | null>;

  constructor(
    documentModelModules: DocumentModelModule[],
    storage: IDriveStorage,
    cache: ICache,
    queueManager: IQueueManager,
    eventEmitter: IEventEmitter,
    synchronizationManager: ISynchronizationManager,
    listenerManager: IListenerManager,
    transmitterFactory: ITransmitterFactory,

    options?: DocumentDriveServerOptions,
  ) {
    this.documentModelModules = documentModelModules;
    this.storage = storage;
    this.cache = cache;
    this.queueManager = queueManager;
    this.eventEmitter = eventEmitter;
    this.synchronizationManager = synchronizationManager;
    this.listenerManager = listenerManager;
    this.transmitterFactory = transmitterFactory;

    this.options = {
      ...options,
      defaultDrives: {
        ...options?.defaultDrives,
      },
      listenerManager: {
        ...DefaultListenerManagerOptions,
        ...options?.listenerManager,
      },
      taskQueueMethod:
        options?.taskQueueMethod === undefined
          ? RunAsap.runAsap
          : options.taskQueueMethod,
    };

    this.defaultDrivesManager = new DefaultDrivesManager(
      this,
      this.defaultDrivesManagerDelegate,
      options,
    );

    this.storage.setStorageDelegate?.({
      getCachedOperations: async <TAction extends Action = Action>(
        drive: string,
        id: string,
      ) => {
        try {
          const document = await this.cache.getDocument<
            unknown,
            unknown,
            TAction
          >(drive, id);
          return document?.operations;
        } catch (error) {
          logger.error(error);
          return undefined;
        }
      },
    });

    this.initializePromise = this._initialize();
  }

  initialize() {
    return this.initializePromise;
  }

  private async _initialize() {
    await this.listenerManager.initialize(this.handleListenerError);

    await this.queueManager.init(this.queueDelegate, (error) => {
      logger.error(`Error initializing queue manager`, error);
      errors.push(error);
    });

    try {
      await this.defaultDrivesManager.removeOldremoteDrives();
    } catch (error) {
      logger.error(error);
    }

    const errors: Error[] = [];
    const drives = await this.getDrives();
    for (const drive of drives) {
      await this._initializeDrive(drive).catch((error) => {
        logger.error(`Error initializing drive ${drive}`, error);
        errors.push(error as Error);
      });
    }

    if (this.options.defaultDrives.loadOnInit !== false) {
      await this.defaultDrivesManager.initializeDefaultRemoteDrives();
    }

    return errors.length === 0 ? null : errors;
  }

  setDocumentModelModules(modules: DocumentModelModule[]): void {
    this.documentModelModules = [...modules];
    this.eventEmitter.emit("documentModelModules", [...modules]);
  }

  initializeDefaultRemoteDrives() {
    return this.defaultDrivesManager.initializeDefaultRemoteDrives();
  }

  getDefaultRemoteDrives() {
    return this.defaultDrivesManager.getDefaultRemoteDrives();
  }

  setDefaultDriveAccessLevel(url: string, level: RemoteDriveAccessLevel) {
    return this.defaultDrivesManager.setDefaultDriveAccessLevel(url, level);
  }

  setAllDefaultDrivesAccessLevel(level: RemoteDriveAccessLevel) {
    return this.defaultDrivesManager.setAllDefaultDrivesAccessLevel(level);
  }

  private getOperationSource(source: StrandUpdateSource) {
    return source.type === "local" ? "push" : "pull";
  }

  private handleListenerError(
    error: Error,
    driveId: string,
    listener: ListenerState,
  ) {
    logger.error(
      `Listener ${listener.listener.label ?? listener.listener.listenerId} error:`,
      error,
    );

    const status = error instanceof OperationError ? error.status : "ERROR";

    this.synchronizationManager.updateSyncStatus(
      driveId,
      { push: status },
      error,
    );
  }

  private shouldSyncRemoteDrive(drive: DocumentDriveDocument) {
    return (
      drive.state.local.availableOffline &&
      drive.state.local.triggers.length > 0
    );
  }

  private async startSyncRemoteDrive(driveId: string) {
    let driveTriggers = this.triggerMap.get(driveId);

    const syncUnits = await this.getSynchronizationUnitsIds(driveId);

    const drive = await this.getDrive(driveId);
    for (const trigger of drive.state.local.triggers) {
      if (driveTriggers?.get(trigger.id)) {
        continue;
      }

      if (!driveTriggers) {
        driveTriggers = new Map();
      }

      this.synchronizationManager.updateSyncStatus(driveId, {
        pull: "SYNCING",
      });

      for (const syncUnit of syncUnits) {
        this.synchronizationManager.updateSyncStatus(syncUnit.syncId, {
          pull: "SYNCING",
        });
      }

      if (PullResponderTransmitter.isPullResponderTrigger(trigger)) {
        let firstPull = true;
        const cancelPullLoop = PullResponderTransmitter.setupPull(
          driveId,
          trigger,
          this.saveStrand.bind(this),
          (error) => {
            const statusError =
              error instanceof OperationError ? error.status : "ERROR";

            this.synchronizationManager.updateSyncStatus(
              driveId,
              { pull: statusError },
              error,
            );

            if (error instanceof ClientError) {
              this.eventEmitter.emit(
                "clientStrandsError",
                driveId,
                trigger,
                error.response.status,
                error.message,
              );
            }
          },
          (revisions) => {
            const errorRevision = revisions.filter(
              (r) => r.status !== "SUCCESS",
            );

            if (errorRevision.length < 1) {
              this.synchronizationManager.updateSyncStatus(driveId, {
                pull: "SUCCESS",
              });
            }

            const documentIdsFromRevision = revisions
              .filter((rev) => rev.documentId !== "")
              .map((rev) => rev.documentId);

            this.getSynchronizationUnitsIds(driveId, documentIdsFromRevision)
              .then((revSyncUnits) => {
                for (const syncUnit of revSyncUnits) {
                  const fileErrorRevision = errorRevision.find(
                    (r) => r.documentId === syncUnit.documentId,
                  );

                  if (fileErrorRevision) {
                    this.synchronizationManager.updateSyncStatus(
                      syncUnit.syncId,
                      { pull: fileErrorRevision.status },
                      fileErrorRevision.error,
                    );
                  } else {
                    this.synchronizationManager.updateSyncStatus(
                      syncUnit.syncId,
                      {
                        pull: "SUCCESS",
                      },
                    );
                  }
                }
              })
              .catch(console.error);

            // if it is the first pull and returns empty
            // then updates corresponding push transmitter
            if (firstPull) {
              firstPull = false;
              const pushListener = drive.state.local.listeners.find(
                (listener) => trigger.data.url === listener.callInfo?.data,
              );
              if (pushListener) {
                this.getSynchronizationUnitsRevision(driveId, syncUnits)
                  .then((syncUnitRevisions) => {
                    for (const revision of syncUnitRevisions) {
                      this.listenerManager
                        .updateListenerRevision(
                          pushListener.listenerId,
                          driveId,
                          revision.syncId,
                          revision.revision,
                        )
                        .catch(logger.error);
                    }
                  })
                  .catch(logger.error);
              }
            }
          },
        );
        driveTriggers.set(trigger.id, cancelPullLoop);
        this.triggerMap.set(driveId, driveTriggers);
      }
    }
  }

  private async stopSyncRemoteDrive(driveId: string) {
    const syncUnits = await this.getSynchronizationUnitsIds(driveId);
    const filesNodeSyncId = syncUnits
      .filter((syncUnit) => syncUnit.documentId !== "")
      .map((syncUnit) => syncUnit.syncId);

    const triggers = this.triggerMap.get(driveId);
    triggers?.forEach((cancel) => cancel());
    this.synchronizationManager.updateSyncStatus(driveId, null);

    for (const fileNodeSyncId of filesNodeSyncId) {
      this.synchronizationManager.updateSyncStatus(fileNodeSyncId, null);
    }
    return this.triggerMap.delete(driveId);
  }

  private defaultDrivesManagerDelegate = {
    detachDrive: this.detachDrive.bind(this),
    emit: (...args: Parameters<DriveEvents["defaultRemoteDrive"]>) =>
      this.eventEmitter.emit("defaultRemoteDrive", ...args),
  };

  private queueDelegate = {
    checkDocumentExists: (
      driveId: string,
      documentId: string,
    ): Promise<boolean> =>
      this.storage.checkDocumentExists(driveId, documentId),
    processOperationJob: async ({
      driveId,
      documentId,
      operations,
      options,
    }: OperationJob) => {
      return documentId
        ? this.addOperations(driveId, documentId, operations, options)
        : this.addDriveOperations(driveId, operations, options);
    },
    processActionJob: async ({
      driveId,
      documentId,
      actions,
      options,
    }: ActionJob) => {
      return documentId
        ? this.addActions(driveId, documentId, actions, options)
        : this.addDriveActions(driveId, actions, options);
    },
    processJob: async (job: Job) => {
      if (isOperationJob(job)) {
        return this.queueDelegate.processOperationJob(job);
      } else if (isActionJob(job)) {
        return this.queueDelegate.processActionJob(job);
      } else {
        throw new Error("Unknown job type", job);
      }
    },
  };

  private async _initializeDrive(driveId: string) {
    const drive = await this.getDrive(driveId);
    await this.synchronizationManager.initializeDriveSyncStatus(driveId, drive);

    if (this.shouldSyncRemoteDrive(drive)) {
      await this.startSyncRemoteDrive(driveId);
    }

    for (const zodListener of drive.state.local.listeners) {
      const transmitter = this.transmitterFactory.instance(
        zodListener.callInfo?.transmitterType ?? "",
        {
          driveId,
          listenerId: zodListener.listenerId,
          block: zodListener.block,
          filter: zodListener.filter,
          system: zodListener.system,
          label: zodListener.label ?? "",
          callInfo: zodListener.callInfo ?? undefined,
        },
        this,
      );

      await this.listenerManager.setListener(driveId, {
        block: zodListener.block,
        driveId: drive.state.global.id,
        filter: {
          branch: zodListener.filter.branch ?? [],
          documentId: zodListener.filter.documentId ?? [],
          documentType: zodListener.filter.documentType,
          scope: zodListener.filter.scope ?? [],
        },
        listenerId: zodListener.listenerId,
        callInfo: zodListener.callInfo ?? undefined,
        system: zodListener.system,
        label: zodListener.label ?? "",
        transmitter,
      });
    }
  }

  // Delegate synchronization methods to synchronizationManager
  getSynchronizationUnits(
    driveId: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
  ): Promise<SynchronizationUnit[]> {
    return this.synchronizationManager.getSynchronizationUnits(
      driveId,
      documentId,
      scope,
      branch,
      documentType,
    );
  }

  getSynchronizationUnitsIds(
    driveId: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
  ): Promise<SynchronizationUnitQuery[]> {
    return this.synchronizationManager.getSynchronizationUnitsIds(
      driveId,
      documentId,
      scope,
      branch,
      documentType,
    );
  }

  getOperationData(
    driveId: string,
    syncId: string,
    filter: GetStrandsOptions,
  ): Promise<OperationUpdate[]> {
    return this.synchronizationManager.getOperationData(
      driveId,
      syncId,
      filter,
    );
  }

  getSynchronizationUnitsRevision(
    driveId: string,
    syncUnitsQuery: SynchronizationUnitQuery[],
  ): Promise<SynchronizationUnit[]> {
    return this.synchronizationManager.getSynchronizationUnitsRevision(
      driveId,
      syncUnitsQuery,
    );
  }

  protected getDocumentModelModule<
    TGlobalState = unknown,
    TLocalState = unknown,
    TAction extends Action = Action,
  >(documentType: string) {
    const documentModelModule = this.documentModelModules.find(
      (module) => module.documentType === documentType,
    );
    if (!documentModelModule) {
      throw new Error(`Document type ${documentType} not supported`);
    }
    return documentModelModule as DocumentModelModule<
      TGlobalState,
      TLocalState,
      TAction
    >;
  }

  getDocumentModelModules() {
    return [...this.documentModelModules];
  }

  async addDrive(input: DriveInput): Promise<DocumentDriveDocument> {
    const id = input.global.id || generateUUID();
    if (!id) {
      throw new Error("Invalid Drive Id");
    }

    const drives = await this.storage.getDrives();
    if (drives.includes(id)) {
      throw new DriveAlreadyExistsError(id);
    }

    const document = createDocument({
      state: input,
    });

    await this.storage.createDrive(id, document);

    if (input.global.slug) {
      await this.cache.deleteDocument("drives-slug", input.global.slug);
    }

    await this._initializeDrive(id);

    this.eventEmitter.emit("driveAdded", document);

    return document;
  }

  async addRemoteDrive(
    url: string,
    options: RemoteDriveOptions,
  ): Promise<DocumentDriveDocument> {
    const { id, name, slug, icon } =
      options.expectedDriveInfo || (await requestPublicDrive(url));

    const {
      pullFilter,
      pullInterval,
      availableOffline,
      sharingType,
      listeners,
      triggers,
    } = options;

    const pullTrigger =
      await PullResponderTransmitter.createPullResponderTrigger(id, url, {
        pullFilter,
        pullInterval,
      });

    return await this.addDrive({
      global: {
        id: id,
        name,
        slug,
        icon: icon ?? null,
      },
      local: {
        triggers: [...triggers, pullTrigger],
        listeners: listeners,
        availableOffline,
        sharingType,
      },
    });
  }

  public async registerPullResponderTrigger(
    driveId: string,
    url: string,
    options: Pick<RemoteDriveOptions, "pullFilter" | "pullInterval">,
  ) {
    const pullTrigger =
      await PullResponderTransmitter.createPullResponderTrigger(
        driveId,
        url,
        options,
      );

    return pullTrigger;
  }

  async deleteDrive(driveId: string) {
    const result = await Promise.allSettled([
      this.stopSyncRemoteDrive(driveId),
      this.listenerManager.removeDrive(driveId),
      this.cache.deleteDocument("drives", driveId),
      this.storage.deleteDrive(driveId),
    ]);

    result.forEach((r) => {
      if (r.status === "rejected") {
        throw r.reason;
      }
    });
  }

  getDrives() {
    return this.storage.getDrives();
  }

  async getDrive(driveId: string, options?: GetDocumentOptions) {
    let document: DocumentDriveDocument | undefined;
    try {
      const cachedDocument = await this.cache.getDocument("drives", driveId); // TODO support GetDocumentOptions
      if (cachedDocument && isDocumentDrive(cachedDocument)) {
        document = cachedDocument;
        if (isAtRevision(document, options?.revisions)) {
          return document;
        }
      }
    } catch (e) {
      logger.error("Error getting drive from cache", e);
    }
    const driveStorage = document ?? (await this.storage.getDrive(driveId));
    const result = this._buildDocument(driveStorage, options);
    if (!isDocumentDrive(result)) {
      throw new Error(`Document with id ${driveId} is not a Document Drive`);
    } else {
      if (!options?.revisions) {
        this.cache.setDocument("drives", driveId, result).catch(logger.error);
      }
      return result;
    }
  }

  async getDriveBySlug(slug: string, options?: GetDocumentOptions) {
    try {
      const document = await this.cache.getDocument("drives-slug", slug);
      if (document && isDocumentDrive(document)) {
        return document;
      }
    } catch (e) {
      logger.error("Error getting drive from cache", e);
    }

    const driveStorage = await this.storage.getDriveBySlug(slug);
    const document = this._buildDocument(driveStorage, options);
    if (!isDocumentDrive(document)) {
      throw new Error(`Document with slug ${slug} is not a Document Drive`);
    } else {
      this.cache.setDocument("drives-slug", slug, document).catch(logger.error);
      return document;
    }
  }

  async getDocument<
    TGlobalState = unknown,
    TLocalState = unknown,
    TAction extends Action = Action,
  >(driveId: string, documentId: string, options?: GetDocumentOptions) {
    let cachedDocument:
      | PHDocument<TGlobalState, TLocalState, TAction>
      | undefined;
    try {
      cachedDocument = await this.cache.getDocument(driveId, documentId); // TODO support GetDocumentOptions
      if (cachedDocument && isAtRevision(cachedDocument, options?.revisions)) {
        return cachedDocument;
      }
    } catch (e) {
      logger.error("Error getting document from cache", e);
    }
    const documentStorage =
      cachedDocument ?? (await this.storage.getDocument(driveId, documentId));
    const document = this._buildDocument(documentStorage, options);

    if (!options?.revisions) {
      this.cache.setDocument(driveId, documentId, document).catch(logger.error);
    }
    return document;
  }

  getDocuments(driveId: string) {
    return this.storage.getDocuments(driveId);
  }

  protected async createDocument(driveId: string, input: CreateDocumentInput) {
    // if a document was provided then checks if it's valid
    let state = undefined;
    if (input.document) {
      if (input.documentType !== input.document.documentType) {
        throw new Error(`Provided document is not ${input.documentType}`);
      }
      const doc = this._buildDocument(input.document);
      state = doc.state;
    }

    // if no document was provided then create a new one
    const document =
      input.document ??
      this.getDocumentModelModule(input.documentType).utils.createDocument();

    // stores document information
    const documentStorage: PHDocument = {
      name: document.name,
      revision: document.revision,
      documentType: document.documentType,
      created: document.created,
      lastModified: document.lastModified,
      operations: { global: [], local: [] },
      initialState: document.initialState,
      clipboard: [],
      state: state ?? document.state,
    };
    await this.storage.createDocument(driveId, input.id, documentStorage);

    // set initial state for new syncUnits
    for (const syncUnit of input.synchronizationUnits) {
      this.synchronizationManager.updateSyncStatus(syncUnit.syncId, {
        pull: this.triggerMap.get(driveId) ? "INITIAL_SYNC" : undefined,
        push: this.listenerManager.driveHasListeners(driveId)
          ? "SUCCESS"
          : undefined,
      });
    }

    // if the document contains operations then
    // stores the operations in the storage
    const operations = Object.values(document.operations).flat();
    if (operations.length) {
      if (isDocumentDrive(document)) {
        await this.storage.addDriveOperations(
          driveId,
          operations as Operation<DocumentDriveAction>[],
          document,
        );
      } else {
        await this.storage.addDocumentOperations(
          driveId,
          input.id,
          operations,
          document,
        );
      }
    }

    return document;
  }

  async deleteDocument(driveId: string, documentId: string) {
    try {
      const syncUnits = await this.getSynchronizationUnitsIds(driveId, [
        documentId,
      ]);

      // remove document sync units status when a document is deleted
      for (const syncUnit of syncUnits) {
        this.synchronizationManager.updateSyncStatus(syncUnit.syncId, null);
      }
      await this.listenerManager.removeSyncUnits(driveId, syncUnits);
    } catch (error) {
      logger.warn("Error deleting document", error);
    }
    await this.cache.deleteDocument(driveId, documentId);
    return this.storage.deleteDocument(driveId, documentId);
  }

  async _processOperations(
    driveId: string,
    documentId: string | undefined,
    documentStorage: PHDocument,
    operations: Operation[],
  ) {
    const operationsApplied: Operation[] = [];
    const signals: SignalResult[] = [];

    const documentStorageWithState = await this._addDocumentResultingStage(
      documentStorage,
      driveId,
      documentId,
    );

    let document = this._buildDocument(documentStorageWithState);
    let error: OperationError | undefined; // TODO: replace with an array of errors/consistency issues
    const operationsByScope = groupOperationsByScope(operations);

    for (const scope of Object.keys(operationsByScope)) {
      const storageDocumentOperations =
        documentStorage.operations[scope as OperationScope];

      // TODO two equal operations done by two clients will be considered the same, ie: { type: "INCREMENT" }
      const branch = removeExistingOperations(
        operationsByScope[scope as OperationScope] || [],
        storageDocumentOperations,
      );

      // No operations to apply
      if (branch.length < 1) {
        continue;
      }

      const trunk = garbageCollect(sortOperations(storageDocumentOperations));

      const [invertedTrunk, tail] = attachBranch(trunk, branch);

      const newHistory =
        tail.length < 1
          ? invertedTrunk
          : merge(trunk, invertedTrunk, reshuffleByTimestamp);

      const newOperations = newHistory.filter(
        (op) => trunk.length < 1 || precedes(trunk[trunk.length - 1], op),
      );

      for (const nextOperation of newOperations) {
        let skipHashValidation = false;

        // when dealing with a merge (tail.length > 0) we have to skip hash validation
        // for the operations that were re-indexed (previous hash becomes invalid due the new position in the history)
        if (tail.length > 0) {
          const sourceOperation = operations.find(
            (op) => op.hash === nextOperation.hash,
          );

          skipHashValidation =
            !sourceOperation ||
            sourceOperation.index !== nextOperation.index ||
            sourceOperation.skip !== nextOperation.skip;
        }

        try {
          // runs operation on next available tick, to avoid blocking the main thread
          const taskQueueMethod = this.options.taskQueueMethod;
          const task = () =>
            this._performOperation(
              driveId,
              documentId,
              document,
              nextOperation,
              skipHashValidation,
            );
          const appliedResult = await (taskQueueMethod
            ? runAsapAsync(task, taskQueueMethod)
            : task());
          document = appliedResult.document;
          signals.push(...appliedResult.signals);
          operationsApplied.push(appliedResult.operation);

          // TODO what to do if one of the applied operations has an error?
        } catch (e) {
          error =
            e instanceof OperationError
              ? e
              : new OperationError(
                  "ERROR",
                  nextOperation,
                  (e as Error).message,
                  (e as Error).cause,
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
    } as const;
  }

  private async _addDocumentResultingStage(
    document: PHDocument,
    driveId: string,
    documentId?: string,
    options?: GetDocumentOptions,
  ): Promise<PHDocument> {
    // apply skip header operations to all scopes
    const operations =
      options?.revisions !== undefined
        ? filterOperationsByRevision(document.operations, options.revisions)
        : document.operations;
    const documentOperations = garbageCollectDocumentOperations(operations);

    for (const scope of Object.keys(documentOperations)) {
      const lastRemainingOperation =
        documentOperations[scope as OperationScope].at(-1);
      // if the latest operation doesn't have a resulting state then tries
      // to retrieve it from the db to avoid rerunning all the operations
      if (lastRemainingOperation && !lastRemainingOperation.resultingState) {
        lastRemainingOperation.resultingState = await (documentId
          ? this.storage.getOperationResultingState?.(
              driveId,
              documentId,
              lastRemainingOperation.index,
              lastRemainingOperation.scope,
              "main",
            )
          : this.storage.getDriveOperationResultingState?.(
              driveId,
              lastRemainingOperation.index,
              lastRemainingOperation.scope,
              "main",
            ));
      }
    }

    return {
      ...document,
      operations: documentOperations,
    };
  }

  private _buildDocument<TGlobalState, TLocalState, TAction extends Action>(
    documentStorage: PHDocument<TGlobalState, TLocalState, TAction>,
    options?: GetDocumentOptions,
  ): PHDocument<TGlobalState, TLocalState, TAction> {
    if (
      documentStorage.state &&
      (!options || options.checkHashes === false) &&
      isAtRevision(documentStorage, options?.revisions)
    ) {
      return documentStorage;
    }

    const documentModelModule = this.getDocumentModelModule<
      TGlobalState,
      TLocalState,
      TAction
    >(documentStorage.documentType);

    const revisionOperations =
      options?.revisions !== undefined
        ? filterOperationsByRevision(
            documentStorage.operations,
            options.revisions,
          )
        : documentStorage.operations;
    const operations = garbageCollectDocumentOperations(revisionOperations);

    return replayDocument<TGlobalState, TLocalState, TAction>(
      documentStorage.initialState,
      operations,
      documentModelModule.reducer,
      undefined,
      documentStorage,
      undefined,
      {
        ...options,
        checkHashes: options?.checkHashes ?? true,
        reuseOperationResultingState: options?.checkHashes ?? true,
      },
    );
  }

  private async _performOperation(
    driveId: string,
    documentId: string | undefined,
    document: PHDocument,
    operation: Operation,
    skipHashValidation = false,
  ) {
    const documentModelModule = this.getDocumentModelModule(
      document.documentType,
    );

    const signalResults: SignalResult[] = [];
    let newDocument = document;

    const scope = operation.scope;
    const documentOperations = garbageCollectDocumentOperations({
      ...document.operations,
      [scope]: skipHeaderOperations(document.operations[scope], operation),
    });

    const lastRemainingOperation = documentOperations[scope].at(-1);
    // if the latest operation doesn't have a resulting state then tries
    // to retrieve it from the db to avoid rerunning all the operations
    if (lastRemainingOperation && !lastRemainingOperation.resultingState) {
      lastRemainingOperation.resultingState = await (documentId
        ? this.storage.getOperationResultingState?.(
            driveId,
            documentId,
            lastRemainingOperation.index,
            lastRemainingOperation.scope,
            "main",
          )
        : this.storage.getDriveOperationResultingState?.(
            driveId,
            lastRemainingOperation.index,
            lastRemainingOperation.scope,
            "main",
          ));
    }

    const operationSignals: (() => Promise<SignalResult>)[] = [];
    newDocument = documentModelModule.reducer(
      newDocument,
      operation,
      (signal) => {
        let handler: (() => Promise<unknown>) | undefined = undefined;
        switch (signal.type) {
          case "CREATE_CHILD_DOCUMENT":
            handler = () => this.createDocument(driveId, signal.input);
            break;
          case "DELETE_CHILD_DOCUMENT":
            handler = () => this.deleteDocument(driveId, signal.input.id);
            break;
          case "COPY_CHILD_DOCUMENT":
            handler = () =>
              this.getDocument(driveId, signal.input.id).then(
                (documentToCopy) =>
                  this.createDocument(driveId, {
                    id: signal.input.newId,
                    documentType: documentToCopy.documentType,
                    document: documentToCopy,
                    synchronizationUnits: signal.input.synchronizationUnits,
                  }),
              );
            break;
        }
        if (handler) {
          operationSignals.push(() =>
            handler().then((result) => ({ signal, result })),
          );
        }
      },
      { skip: operation.skip, reuseOperationResultingState: true },
    );

    const appliedOperations = newDocument.operations[operation.scope].filter(
      (op) => op.index == operation.index && op.skip == operation.skip,
    );
    const appliedOperation = appliedOperations.at(0);

    if (!appliedOperation) {
      throw new OperationError(
        "ERROR",
        operation,
        `Operation with index ${operation.index}:${operation.skip} was not applied.`,
      );
    }
    if (
      !appliedOperation.error &&
      appliedOperation.hash !== operation.hash &&
      !skipHashValidation
    ) {
      throw new ConflictOperationError(operation, appliedOperation);
    }

    for (const signalHandler of operationSignals) {
      const result = await signalHandler();
      signalResults.push(result);
    }

    return {
      document: newDocument,
      signals: signalResults,
      operation: appliedOperation,
    };
  }

  addOperation(
    driveId: string,
    documentId: string,
    operation: Operation,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.addOperations(driveId, documentId, [operation], options);
  }

  private async _addOperations(
    driveId: string,
    documentId: string,
    callback: (document: PHDocument) => Promise<{
      operations: Operation[];
      header: DocumentHeader;
    }>,
  ) {
    if (!this.storage.addDocumentOperationsWithTransaction) {
      const documentStorage = await this.storage.getDocument(
        driveId,
        documentId,
      );
      const result = await callback(documentStorage);
      // saves the applied operations to storage
      if (result.operations.length > 0) {
        await this.storage.addDocumentOperations(
          driveId,
          documentId,
          result.operations,
          result.header,
        );
      }
    } else {
      await this.storage.addDocumentOperationsWithTransaction(
        driveId,
        documentId,
        callback,
      );
    }
  }

  queueOperation(
    driveId: string,
    documentId: string,
    operation: Operation,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.queueOperations(driveId, documentId, [operation], options);
  }

  private async resultIfExistingOperations(
    drive: string,
    id: string,
    operations: Operation[],
  ): Promise<IOperationResult | undefined> {
    try {
      const document = await this.getDocument(drive, id);
      const newOperation = operations.find(
        (op) =>
          !op.id ||
          !document.operations[op.scope].find(
            (existingOp) =>
              existingOp.id === op.id &&
              existingOp.index === op.index &&
              existingOp.type === op.type &&
              existingOp.hash === op.hash,
          ),
      );
      if (!newOperation) {
        return {
          status: "SUCCESS",
          document,
          operations,
          signals: [],
        };
      } else {
        return undefined;
      }
    } catch (error) {
      if (
        !(error as Error).message.includes(`Document with id ${id} not found`)
      ) {
        console.error(error);
      }
      return undefined;
    }
  }

  async queueOperations(
    driveId: string,
    documentId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ) {
    // if operations are already stored then returns cached document
    const result = await this.resultIfExistingOperations(
      driveId,
      documentId,
      operations,
    );
    if (result) {
      return result;
    }
    try {
      const jobId = await this.queueManager.addJob({
        driveId: driveId,
        documentId: documentId,
        operations,
        options,
      });

      return new Promise<IOperationResult>((resolve, reject) => {
        const unsubscribe = this.queueManager.on(
          "jobCompleted",
          (job, result) => {
            if (job.jobId === jobId) {
              unsubscribe();
              unsubscribeError();
              resolve(result);
            }
          },
        );
        const unsubscribeError = this.queueManager.on(
          "jobFailed",
          (job, error) => {
            if (job.jobId === jobId) {
              unsubscribe();
              unsubscribeError();
              reject(error);
            }
          },
        );
      });
    } catch (error) {
      logger.error("Error adding job", error);
      throw error;
    }
  }

  async queueAction(
    driveId: string,
    documentId: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.queueActions(driveId, documentId, [action], options);
  }

  async queueActions(
    driveId: string,
    documentId: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    try {
      const jobId = await this.queueManager.addJob({
        driveId: driveId,
        documentId: documentId,
        actions,
        options,
      });

      return new Promise<IOperationResult>((resolve, reject) => {
        const unsubscribe = this.queueManager.on(
          "jobCompleted",
          (job, result) => {
            if (job.jobId === jobId) {
              unsubscribe();
              unsubscribeError();
              resolve(result);
            }
          },
        );
        const unsubscribeError = this.queueManager.on(
          "jobFailed",
          (job, error) => {
            if (job.jobId === jobId) {
              unsubscribe();
              unsubscribeError();
              reject(error);
            }
          },
        );
      });
    } catch (error) {
      logger.error("Error adding job", error);
      throw error;
    }
  }

  async queueDriveAction(
    driveId: string,
    action: DocumentDriveAction,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveDocument>> {
    return this.queueDriveActions(driveId, [action], options);
  }

  async queueDriveActions(
    driveId: string,
    actions: DocumentDriveAction[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveDocument>> {
    try {
      const jobId = await this.queueManager.addJob({
        driveId: driveId,
        actions,
        options,
      });
      return new Promise<IOperationResult<DocumentDriveDocument>>(
        (resolve, reject) => {
          const unsubscribe = this.queueManager.on(
            "jobCompleted",
            (job, result) => {
              if (job.jobId === jobId) {
                unsubscribe();
                unsubscribeError();
                resolve(result as IOperationResult<DocumentDriveDocument>);
              }
            },
          );
          const unsubscribeError = this.queueManager.on(
            "jobFailed",
            (job, error) => {
              if (job.jobId === jobId) {
                unsubscribe();
                unsubscribeError();
                reject(error);
              }
            },
          );
        },
      );
    } catch (error) {
      logger.error("Error adding drive job", error);
      throw error;
    }
  }

  async addOperations(
    driveId: string,
    documentId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    // if operations are already stored then returns the result
    const result = await this.resultIfExistingOperations(
      driveId,
      documentId,
      operations,
    );
    if (result) {
      return result;
    }
    let document: PHDocument | undefined;
    const operationsApplied: Operation[] = [];
    const signals: SignalResult[] = [];
    let error: Error | undefined;

    try {
      await this._addOperations(
        driveId,
        documentId,
        async (documentStorage) => {
          const result = await this._processOperations(
            driveId,
            documentId,
            documentStorage,
            operations,
          );

          if (!result.document) {
            logger.error("Invalid document");
            throw result.error ?? new Error("Invalid document");
          }

          document = result.document;
          error = result.error;
          signals.push(...result.signals);
          operationsApplied.push(...result.operationsApplied);

          return {
            operations: result.operationsApplied,
            header: result.document,
            newState: document.state,
          };
        },
      );

      if (document) {
        this.cache
          .setDocument(driveId, documentId, document)
          .catch(logger.error);
      }

      // gets all the different scopes and branches combinations from the operations
      const { scopes, branches } = operationsApplied.reduce(
        (acc, operation) => {
          if (!acc.scopes.includes(operation.scope)) {
            acc.scopes.push(operation.scope);
          }
          return acc;
        },
        { scopes: [] as string[], branches: ["main"] },
      );

      const syncUnits = await this.getSynchronizationUnits(
        driveId,
        [documentId],
        scopes,
        branches,
      );

      // checks if any of the provided operations where reshufled
      const newOp = operationsApplied.find(
        (appliedOp) =>
          !operations.find(
            (o) =>
              o.id === appliedOp.id &&
              o.index === appliedOp.index &&
              o.skip === appliedOp.skip &&
              o.hash === appliedOp.hash,
          ),
      );

      // if there are no new operations then reuses the provided source
      // otherwise sets it to local so listeners know that there were
      // new changes originating from this document drive server
      const source: StrandUpdateSource = newOp
        ? { type: "local" }
        : (options?.source ?? { type: "local" });

      // update listener cache

      const operationSource = this.getOperationSource(source);

      this.listenerManager
        .updateSynchronizationRevisions(
          driveId,
          syncUnits,
          source,
          () => {
            this.synchronizationManager.updateSyncStatus(driveId, {
              [operationSource]: "SYNCING",
            });

            for (const syncUnit of syncUnits) {
              this.synchronizationManager.updateSyncStatus(syncUnit.syncId, {
                [operationSource]: "SYNCING",
              });
            }
          },
          this.handleListenerError.bind(this),
          options?.forceSync ?? source.type === "local",
        )
        .then((updates) => {
          if (updates.length) {
            this.synchronizationManager.updateSyncStatus(driveId, {
              [operationSource]: "SUCCESS",
            });
          }

          for (const syncUnit of syncUnits) {
            this.synchronizationManager.updateSyncStatus(syncUnit.syncId, {
              [operationSource]: "SUCCESS",
            });
          }
        })
        .catch((error) => {
          logger.error("Non handled error updating sync revision", error);
          this.synchronizationManager.updateSyncStatus(
            driveId,
            {
              [operationSource]: "ERROR",
            },
            error as Error,
          );

          for (const syncUnit of syncUnits) {
            this.synchronizationManager.updateSyncStatus(
              syncUnit.syncId,
              {
                [operationSource]: "ERROR",
              },
              error as Error,
            );
          }
        });

      // after applying all the valid operations,throws
      // an error if there was an invalid operation
      if (error) {
        throw error;
      }

      return {
        status: "SUCCESS",
        document,
        operations: operationsApplied,
        signals,
      } satisfies IOperationResult;
    } catch (error) {
      const operationError =
        error instanceof OperationError
          ? error
          : new OperationError(
              "ERROR",
              undefined,
              (error as Error).message,
              (error as Error).cause,
            );

      return {
        status: operationError.status,
        error: operationError,
        document,
        operations: operationsApplied,
        signals,
      } satisfies IOperationResult;
    }
  }

  addDriveOperation(
    driveId: string,
    operation: Operation<DocumentDriveAction>,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult> {
    return this.addDriveOperations(driveId, [operation], options);
  }

  async clearStorage() {
    for (const drive of await this.getDrives()) {
      await this.deleteDrive(drive);
    }

    await this.storage.clearStorage?.();
  }

  private async _addDriveOperations(
    driveId: string,
    callback: (document: DocumentDriveDocument) => Promise<{
      operations: Operation[];
      header: DocumentHeader;
    }>,
  ) {
    if (!this.storage.addDriveOperationsWithTransaction) {
      const documentStorage = await this.storage.getDrive(driveId);
      const result = await callback(documentStorage);
      // saves the applied operations to storage
      if (result.operations.length > 0) {
        await this.storage.addDriveOperations(
          driveId,
          result.operations,
          result.header,
        );
      }
      return result;
    } else {
      return this.storage.addDriveOperationsWithTransaction(driveId, callback);
    }
  }

  queueDriveOperation(
    driveId: string,
    operation: Operation<DocumentDriveAction>,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult> {
    return this.queueDriveOperations(driveId, [operation], options);
  }

  private async resultIfExistingDriveOperations(
    driveId: string,
    operations: Operation[],
  ): Promise<DriveOperationResult | undefined> {
    try {
      const drive = await this.getDrive(driveId);
      const newOperation = operations.find(
        (op) =>
          !op.id ||
          !drive.operations[op.scope].find(
            (existingOp) =>
              existingOp.id === op.id &&
              existingOp.index === op.index &&
              existingOp.type === op.type &&
              existingOp.hash === op.hash,
          ),
      );
      if (!newOperation) {
        return {
          status: "SUCCESS",
          document: drive,
          operations: operations,
          signals: [],
        } as DriveOperationResult;
      } else {
        return undefined;
      }
    } catch (error) {
      console.error(error); // TODO error
      return undefined;
    }
  }

  async queueDriveOperations(
    driveId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult> {
    // if operations are already stored then returns cached document
    const result = await this.resultIfExistingDriveOperations(
      driveId,
      operations,
    );
    if (result) {
      return result;
    }
    try {
      const jobId = await this.queueManager.addJob({
        driveId: driveId,
        operations,
        options,
      });
      return new Promise<DriveOperationResult>((resolve, reject) => {
        const unsubscribe = this.queueManager.on(
          "jobCompleted",
          (job, result) => {
            if (job.jobId === jobId) {
              unsubscribe();
              unsubscribeError();
              resolve(result as DriveOperationResult);
            }
          },
        );
        const unsubscribeError = this.queueManager.on(
          "jobFailed",
          (job, error) => {
            if (job.jobId === jobId) {
              unsubscribe();
              unsubscribeError();
              reject(error);
            }
          },
        );
      });
    } catch (error) {
      logger.error("Error adding drive job", error);
      throw error;
    }
  }

  async addDriveOperations(
    driveId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult> {
    let document: DocumentDriveDocument | undefined;
    const operationsApplied: Operation<DocumentDriveAction>[] = [];
    const signals: SignalResult[] = [];
    let error: Error | undefined;

    // if operations are already stored then returns cached drive
    const result = await this.resultIfExistingDriveOperations(
      driveId,
      operations,
    );
    if (result) {
      return result;
    }

    try {
      await this._addDriveOperations(driveId, async (documentStorage) => {
        const result = await this._processOperations(
          driveId,
          undefined,
          documentStorage,
          operations.slice(),
        );
        document = result.document as DocumentDriveDocument;
        operationsApplied.push(
          ...(result.operationsApplied as Operation<DocumentDriveAction>[]),
        );
        signals.push(...result.signals);
        error = result.error;

        return {
          operations: result.operationsApplied,
          header: result.document,
        };
      });

      if (!document || !isDocumentDrive(document)) {
        throw error ?? new Error("Invalid Document Drive document");
      }

      this.cache.setDocument("drives", driveId, document).catch(logger.error);

      for (const operation of operationsApplied) {
        switch (operation.type) {
          case "ADD_LISTENER": {
            const zodListener = operation.input.listener;

            // create the transmitter
            const transmitter = this.transmitterFactory.instance(
              zodListener.callInfo?.transmitterType ?? "",
              {
                driveId,
                listenerId: zodListener.listenerId,
                block: zodListener.block,
                filter: zodListener.filter,
                system: zodListener.system,
                label: zodListener.label ?? "",
                callInfo: zodListener.callInfo ?? undefined,
              },
              this,
            );
            // create the listener
            const listener = {
              ...zodListener,
              driveId: driveId,
              label: zodListener.label ?? "",
              system: zodListener.system ?? false,
              filter: {
                branch: zodListener.filter.branch ?? [],
                documentId: zodListener.filter.documentId ?? [],
                documentType: zodListener.filter.documentType ?? [],
                scope: zodListener.filter.scope ?? [],
              },
              callInfo: {
                data: zodListener.callInfo?.data ?? "",
                name: zodListener.callInfo?.name ?? "PullResponder",
                transmitterType:
                  zodListener.callInfo?.transmitterType ?? "PullResponder",
              },
              transmitter,
            };

            await this.addListener(driveId, listener);
            break;
          }
          case "REMOVE_LISTENER": {
            await this.removeListener(driveId, operation);
            break;
          }
        }
      }

      // update listener cache
      const lastOperation = operationsApplied
        .filter((op) => op.scope === "global")
        .slice()
        .pop();

      if (lastOperation) {
        // checks if any of the provided operations where reshufled
        const newOp = operationsApplied.find(
          (appliedOp) =>
            !operations.find(
              (o) =>
                o.id === appliedOp.id &&
                o.index === appliedOp.index &&
                o.skip === appliedOp.skip &&
                o.hash === appliedOp.hash,
            ),
        );

        // if there are no new operations then reuses the provided source
        // otherwise sets it to local so listeners know that there were
        // new changes originating from this document drive server
        const source: StrandUpdateSource = newOp
          ? { type: "local" }
          : (options?.source ?? { type: "local" });

        const operationSource = this.getOperationSource(source);

        this.listenerManager
          .updateSynchronizationRevisions(
            driveId,
            [
              {
                syncId: "0",
                driveId: driveId,
                documentId: "",
                scope: "global",
                branch: "main",
                documentType: "powerhouse/document-drive",
                lastUpdated: lastOperation.timestamp,
                revision: lastOperation.index,
              },
            ],
            source,
            () => {
              this.synchronizationManager.updateSyncStatus(driveId, {
                [operationSource]: "SYNCING",
              });
            },
            this.handleListenerError.bind(this),
            options?.forceSync ?? source.type === "local",
          )
          .then((updates) => {
            if (updates.length) {
              this.synchronizationManager.updateSyncStatus(driveId, {
                [operationSource]: "SUCCESS",
              });
            }
          })
          .catch((error) => {
            logger.error("Non handled error updating sync revision", error);
            this.synchronizationManager.updateSyncStatus(
              driveId,
              {
                [operationSource]: "ERROR",
              },
              error as Error,
            );
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
        status: "SUCCESS",
        document,
        operations: operationsApplied,
        signals,
      } satisfies DriveOperationResult;
    } catch (error) {
      const operationError =
        error instanceof OperationError
          ? error
          : new OperationError(
              "ERROR",
              undefined,
              (error as Error).message,
              (error as Error).cause,
            );

      return {
        status: operationError.status,
        error: operationError,
        document,
        operations: operationsApplied,
        signals,
      } satisfies IOperationResult;
    }
  }

  private _buildOperations<TAction extends Action = Action>(
    documentId: PHDocument,
    actions: TAction[],
  ): Operation<TAction>[] {
    const operations: Operation<TAction>[] = [];
    const { reducer } = this.getDocumentModelModule(documentId.documentType);
    for (const action of actions) {
      documentId = reducer(documentId, action);
      const operation = documentId.operations[action.scope].slice().pop();
      if (!operation) {
        throw new Error("Error creating operations");
      }
      operations.push(operation as Operation<TAction>);
    }
    return operations;
  }

  async addAction(
    driveId: string,
    documentId: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.addActions(driveId, documentId, [action], options);
  }

  async addActions(
    driveId: string,
    documentId: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    const document = await this.getDocument(driveId, documentId);
    const operations = this._buildOperations(document, actions);
    return this.addOperations(driveId, documentId, operations, options);
  }

  async addDriveAction(
    driveId: string,
    action: DocumentDriveAction | Action,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult> {
    return this.addDriveActions(driveId, [action], options);
  }

  async addDriveActions(
    driveId: string,
    actions: (DocumentDriveAction | Action)[],
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult> {
    const document = await this.getDrive(driveId);
    const operations = this._buildOperations(document, actions);
    const result = await this.addDriveOperations(driveId, operations, options);
    return result;
  }

  async detachDrive(driveId: string) {
    const documentDrive = await this.getDrive(driveId);
    const listeners = documentDrive.state.local.listeners || [];
    const triggers = documentDrive.state.local.triggers || [];

    for (const listener of listeners) {
      await this.addDriveAction(
        driveId,
        removeListener({ listenerId: listener.listenerId }),
      );
    }

    for (const trigger of triggers) {
      await this.addDriveAction(
        driveId,
        removeTrigger({ triggerId: trigger.id }),
      );
    }

    await this.addDriveAction(driveId, setSharingType({ type: "LOCAL" }));
  }

  async addListener(driveId: string, listener: Listener) {
    await this.listenerManager.setListener(driveId, listener);
  }

  async addInternalListener(
    driveId: string,
    receiver: IReceiver,
    options: {
      listenerId: string;
      label: string;
      block: boolean;
      filter: ListenerFilter;
    },
  ) {
    const listener: AddListenerInput["listener"] = {
      callInfo: {
        data: "",
        name: "Interal",
        transmitterType: "Internal",
      },
      system: true,
      ...options,
    };
    await this.addDriveAction(driveId, addListener({ listener }));
    const transmitter = await this.getTransmitter(driveId, options.listenerId);
    if (!transmitter) {
      logger.error("Internal listener not found");
      throw new Error("Internal listener not found");
    }
    if (!(transmitter instanceof InternalTransmitter)) {
      logger.error("Listener is not an internal transmitter");
      throw new Error("Listener is not an internal transmitter");
    }

    transmitter.setReceiver(receiver);
    return transmitter;
  }

  private async removeListener(
    driveId: string,
    operation: Operation<RemoveListenerAction>,
  ) {
    const { listenerId } = operation.input;
    await this.listenerManager.removeListener(driveId, listenerId);
  }

  async getTransmitter(
    driveId: string,
    listenerId: string,
  ): Promise<ITransmitter | undefined> {
    const listener = this.listenerManager.getListenerState(driveId, listenerId);
    return listener.listener.transmitter;
  }

  getListener(
    driveId: string,
    listenerId: string,
  ): Promise<ListenerState | undefined> {
    let listenerState;
    try {
      listenerState = this.listenerManager.getListenerState(
        driveId,
        listenerId,
      );
    } catch {
      return Promise.resolve(undefined);
    }

    return Promise.resolve(listenerState);
  }

  getSyncStatus(
    syncUnitId: string,
  ): SyncStatus | SynchronizationUnitNotFoundError {
    return this.synchronizationManager.getSyncStatus(syncUnitId);
  }

  on<K extends keyof DriveEvents>(event: K, cb: DriveEvents[K]): Unsubscribe {
    return this.eventEmitter.on(event, cb);
  }

  private emit<K extends keyof DriveEvents>(
    event: K,
    ...args: Parameters<DriveEvents[K]>
  ): void {
    return this.eventEmitter.emit(event, ...args);
  }

  getSynchronizationUnit(
    driveId: string,
    syncId: string,
  ): Promise<SynchronizationUnit | undefined> {
    return this.synchronizationManager.getSynchronizationUnit(driveId, syncId);
  }

  // Add delegated methods to properly implement ISynchronizationManager
  updateSyncStatus(
    syncUnitId: string,
    status: Partial<SyncUnitStatusObject> | null,
    error?: Error,
  ): void {
    this.synchronizationManager.updateSyncStatus(syncUnitId, status, error);
  }

  initializeDriveSyncStatus(
    driveId: string,
    drive: DocumentDriveDocument,
  ): Promise<void> {
    return this.synchronizationManager.initializeDriveSyncStatus(
      driveId,
      drive,
    );
  }

  getCombinedSyncUnitStatus(syncUnitStatus: SyncUnitStatusObject): SyncStatus {
    return this.synchronizationManager.getCombinedSyncUnitStatus(
      syncUnitStatus,
    );
  }

  // Add back the saveStrand method that was accidentally removed
  private async saveStrand(strand: StrandUpdate, source: StrandUpdateSource) {
    const operations: Operation[] = strand.operations.map(
      (op: OperationUpdate) => ({
        ...op,
        scope: strand.scope,
        branch: strand.branch,
      }),
    );

    const result = await (!strand.documentId
      ? this.queueDriveOperations(
          strand.driveId,
          operations as Operation<DocumentDriveAction>[],
          { source },
        )
      : this.queueOperations(strand.driveId, strand.documentId, operations, {
          source,
        }));

    if (result.status === "ERROR") {
      const syncUnits =
        strand.documentId !== ""
          ? (
              await this.getSynchronizationUnitsIds(
                strand.driveId,
                [strand.documentId],
                [strand.scope],
                [strand.branch],
              )
            ).map((s) => s.syncId)
          : [strand.driveId];

      const operationSource = this.getOperationSource(source);

      for (const syncUnit of syncUnits) {
        this.synchronizationManager.updateSyncStatus(
          syncUnit,
          { [operationSource]: result.status },
          result.error,
        );
      }
    }
    this.eventEmitter.emit("strandUpdate", strand);
    return result;
  }
}

export type DocumentDriveServerConstructor =
  Constructor<BaseDocumentDriveServer>;

export type DocumentDriveServerMixin<I> = Mixin<
  typeof BaseDocumentDriveServer,
  I
>;

export const DocumentDriveServer = ReadModeServer(BaseDocumentDriveServer);
