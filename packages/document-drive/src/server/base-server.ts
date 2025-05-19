/* eslint-disable @typescript-eslint/no-deprecated */
// TODO remove this when drive methods are deleted
import {
  removeListener,
  removeTrigger,
  setSharingType,
} from "#drive-document-model/gen/creators";
import { createDocument } from "#drive-document-model/gen/utils";
import {
  type ActionJob,
  type IQueueManager,
  type Job,
  type OperationJob,
  isActionJob,
  isOperationJob,
} from "#queue/types";
import { ReadModeServer } from "#read-mode/server";
import {
  type IDocumentStorage,
  type IDriveOperationStorage,
} from "#storage/types";
import {
  DefaultDrivesManager,
  type IDefaultDrivesManager,
} from "#utils/default-drives-manager";
import { requestPublicDrive } from "#utils/graphql";
import { isDocumentDrive, runAsapAsync } from "#utils/misc";
import { RunAsap } from "#utils/run-asap";
import {
  type DocumentDriveAction,
  type DocumentDriveDocument,
  type Trigger,
  childLogger,
} from "document-drive";
import {
  type Action,
  type DocumentHeader,
  type DocumentModelModule,
  type Operation,
  type OperationScope,
  type PHDocument,
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
import { type Unsubscribe } from "nanoevents";
import { type SignalResult } from "../../../document-model/src/document/signal.js";
import { type ICache } from "../cache/types.js";
import {
  ConflictOperationError,
  OperationError,
  type SynchronizationUnitNotFoundError,
} from "./error.js";
import {
  type CancelPullLoop,
  PullResponderTransmitter,
} from "./listener/transmitter/pull-responder.js";
import { SwitchboardPushTransmitter } from "./listener/transmitter/switchboard-push.js";
import { type StrandUpdateSource } from "./listener/transmitter/types.js";
import {
  type AddOperationOptions,
  type Constructor,
  type CreateDocumentInput,
  DefaultListenerManagerOptions,
  type DocumentDriveServerOptions,
  type DriveEvents,
  type DriveInput,
  type DriveOperationResult,
  type GetDocumentOptions,
  type IBaseDocumentDriveServer,
  type IEventEmitter,
  type IListenerManager,
  type IOperationResult,
  type ISynchronizationManager,
  type Listener,
  type ListenerState,
  type Mixin,
  type OperationUpdate,
  type RemoteDriveAccessLevel,
  type RemoteDriveOptions,
  type StrandUpdate,
  type SyncStatus,
  type SyncUnitStatusObject,
  type SynchronizationUnit,
} from "./types.js";
import { filterOperationsByRevision, isAtRevision } from "./utils.js";

export class BaseDocumentDriveServer
  implements IBaseDocumentDriveServer, IDefaultDrivesManager
{
  private logger = childLogger(["BaseDocumentDriveServer"]);

  // external dependencies
  private documentModelModules: DocumentModelModule[];
  private legacyStorage: IDriveOperationStorage;
  private documentStorage: IDocumentStorage;
  private cache: ICache;
  private queueManager: IQueueManager;
  private eventEmitter: IEventEmitter;
  protected options: Required<DocumentDriveServerOptions>;
  private listenerManager: IListenerManager;
  private synchronizationManager: ISynchronizationManager;

  // internal dependencies
  private defaultDrivesManager: DefaultDrivesManager;

  private defaultDrivesManagerDelegate = {
    detachDrive: this.detachDrive.bind(this),
    emit: (...args: Parameters<DriveEvents["defaultRemoteDrive"]>) =>
      this.eventEmitter.emit("defaultRemoteDrive", ...args),
  };

  private queueDelegate = {
    exists: (documentId: string): Promise<boolean> =>
      this.documentStorage.exists(documentId),
    processOperationJob: async ({
      documentId,
      operations,
      options,
    }: OperationJob) => {
      const document = await this.getDocument(documentId);
      return isDocumentDrive(document)
        ? this.processDriveOperations(documentId, operations, options)
        : this.processOperations(documentId, operations, options);
    },
    processActionJob: async ({ documentId, actions, options }: ActionJob) => {
      const document = await this.getDocument(documentId);
      return isDocumentDrive(document)
        ? this.processActions(documentId, actions, options)
        : this.processDriveActions(documentId, actions, options);
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

  // internal state
  private triggerMap = new Map<
    DocumentDriveDocument["id"],
    Map<Trigger["id"], CancelPullLoop>
  >();
  private initializePromise: Promise<Error[] | null>;

  constructor(
    documentModelModules: DocumentModelModule[],
    storage: IDriveOperationStorage,
    documentStorage: IDocumentStorage,
    cache: ICache,
    queueManager: IQueueManager,
    eventEmitter: IEventEmitter,
    synchronizationManager: ISynchronizationManager,
    listenerManager: IListenerManager,

    options?: DocumentDriveServerOptions,
  ) {
    this.documentModelModules = documentModelModules;
    this.legacyStorage = storage;
    this.documentStorage = documentStorage;
    this.cache = cache;
    this.queueManager = queueManager;
    this.eventEmitter = eventEmitter;
    this.synchronizationManager = synchronizationManager;
    this.listenerManager = listenerManager;

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

    // todo: move to external dependencies
    this.defaultDrivesManager = new DefaultDrivesManager(
      this,
      this.defaultDrivesManagerDelegate,
      options,
    );

    this.initializePromise = this._initialize();
  }

  // workaround for testing the ephemeral listeners -- we don't have DI in place yet
  // todo: remove this once we have DI
  get listeners(): IListenerManager {
    return this.listenerManager;
  }

  initialize() {
    return this.initializePromise;
  }

  private async _initialize() {
    await this.listenerManager.initialize(this.handleListenerError.bind(this));

    await this.queueManager.init(this.queueDelegate, (error) => {
      this.logger.error(`Error initializing queue manager`, error);
      errors.push(error);
    });

    try {
      await this.defaultDrivesManager.removeOldremoteDrives();
    } catch (error) {
      this.logger.error(error);
    }

    const errors: Error[] = [];
    const drives = await this.getDrives();
    for (const drive of drives) {
      await this._initializeDrive(drive).catch((error) => {
        this.logger.error(`Error initializing drive ${drive}`, error);
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
    this.synchronizationManager.setDocumentModelModules([...modules]);
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
    this.logger.error(
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

    const syncUnits =
      await this.synchronizationManager.getSynchronizationUnitsIds(driveId);

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
        this.synchronizationManager.updateSyncStatus(syncUnit, {
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
            const errorRevisions = revisions.filter(
              (r) => r.status !== "SUCCESS",
            );

            if (errorRevisions.length < 1) {
              this.synchronizationManager.updateSyncStatus(driveId, {
                pull: "SUCCESS",
              });
            }

            for (const revision of revisions) {
              const { documentId, scope, branch, status, error } = revision;
              this.synchronizationManager.updateSyncStatus(
                { documentId, scope, branch },
                { pull: status },
                error,
              );
            }

            // if it is the first pull and returns empty
            // then updates corresponding push transmitter
            if (firstPull) {
              firstPull = false;
              const pushListener = drive.state.local.listeners.find(
                (listener) => trigger.data.url === listener.callInfo?.data,
              );
              if (pushListener) {
                for (const revision of revisions) {
                  const { documentId, scope, branch } = revision;
                  this.listenerManager
                    .updateListenerRevision(
                      pushListener.listenerId,
                      driveId,
                      { documentId, scope, branch },
                      revision.revision,
                    )
                    .catch(this.logger.error);
                }
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
    const triggers = this.triggerMap.get(driveId);
    triggers?.forEach((cancel) => cancel());
    this.synchronizationManager.updateSyncStatus(driveId, null);

    const syncUnits =
      await this.synchronizationManager.getSynchronizationUnitsIds(driveId);
    for (const syncUnit of syncUnits) {
      this.synchronizationManager.updateSyncStatus(syncUnit, null);
    }
    return this.triggerMap.delete(driveId);
  }

  private async _initializeDrive(driveId: string) {
    const drive = await this.getDrive(driveId);

    this.logger.verbose(
      `[SYNC DEBUG] Initializing drive ${driveId} with slug "${drive.slug}"`,
    );

    await this.synchronizationManager.initializeDriveSyncStatus(driveId, drive);

    if (this.shouldSyncRemoteDrive(drive)) {
      this.logger.verbose(
        `[SYNC DEBUG] Starting sync for remote drive ${driveId}`,
      );
      await this.startSyncRemoteDrive(driveId);
    }

    // add switchboard push listeners
    this.logger.verbose(
      `[SYNC DEBUG] Processing ${drive.state.local.listeners.length} listeners for drive ${driveId}`,
    );

    for (const zodListener of drive.state.local.listeners) {
      if (zodListener.callInfo?.transmitterType === "SwitchboardPush") {
        this.logger.verbose(
          `[SYNC DEBUG] Setting up SwitchboardPush listener ${zodListener.listenerId} for drive ${driveId}`,
        );

        const transmitter = new SwitchboardPushTransmitter(
          zodListener.callInfo.data ?? "",
        );

        this.logger.verbose(
          `[SYNC DEBUG] Created SwitchboardPush transmitter with URL: ${zodListener.callInfo.data || "none"}`,
        );

        await this.listenerManager
          .setListener(driveId, {
            block: zodListener.block,
            driveId: drive.id,
            filter: {
              branch: zodListener.filter.branch ?? [],
              documentId: zodListener.filter.documentId ?? [],
              documentType: zodListener.filter.documentType ?? [],
              scope: zodListener.filter.scope ?? [],
            },
            listenerId: zodListener.listenerId,
            callInfo: zodListener.callInfo,
            system: zodListener.system,
            label: zodListener.label ?? "",
            transmitter,
          })
          .then(() => {
            this.logger.verbose(
              `[SYNC DEBUG] Successfully set up listener ${zodListener.listenerId} for drive ${driveId}`,
            );
          });
      } else if (zodListener.callInfo?.transmitterType === "PullResponder") {
        this.logger.verbose(
          `[SYNC DEBUG] Setting up PullResponder listener ${zodListener.listenerId} for drive ${driveId}`,
        );

        const pullResponderListener: Listener = {
          driveId,
          listenerId: zodListener.listenerId,
          block: false,
          filter: zodListener.filter,
          system: false,
          label: `PullResponder #${zodListener.listenerId}`,
          callInfo: {
            data: "",
            name: "PullResponder",
            transmitterType: "PullResponder",
          },
        };

        const pullResponder = new PullResponderTransmitter(
          pullResponderListener,
          this.listenerManager,
        );
        pullResponderListener.transmitter = pullResponder;

        await this.listenerManager.setListener(driveId, pullResponderListener);
      } else {
        this.logger.error(
          `Skipping listener ${zodListener.listenerId} with unsupported type ${zodListener.callInfo?.transmitterType || "unknown"}`,
        );
      }
    }
  }

  protected getDocumentModelModule<TDocument extends PHDocument>(
    documentType: string,
  ) {
    const documentModelModule = this.documentModelModules.find(
      (module) => module.documentModel.id === documentType,
    );
    if (!documentModelModule) {
      throw new Error(`Document type ${documentType} not supported`);
    }
    return documentModelModule as unknown as DocumentModelModule<TDocument>;
  }

  getDocumentModelModules() {
    return [...this.documentModelModules];
  }

  addDocument<TDocument extends PHDocument>(
    input: CreateDocumentInput<TDocument>,
    preferredEditor?: string,
  ): Promise<TDocument> {
    return this.createDocument(input, { type: "local" }, preferredEditor);
  }

  async addDrive(
    input: DriveInput,
    preferredEditor?: string,
  ): Promise<DocumentDriveDocument> {
    const document = createDocument({
      id: input.id,
      slug: input.slug,
      state: {
        global: {
          icon: input.global.icon ?? null,
          name: input.global.name,
        },
        local: input.local ?? {},
      },
    });

    document.meta = {
      preferredEditor: preferredEditor,
    };

    await this.documentStorage.create(document);

    if (input.slug && input.slug.length > 0) {
      await this.cache.deleteDriveBySlug(input.slug);
    }

    await this._initializeDrive(document.id);

    this.eventEmitter.emit("driveAdded", document);

    return document;
  }

  async addRemoteDrive(
    url: string,
    options: RemoteDriveOptions,
  ): Promise<DocumentDriveDocument> {
    const { id, name, slug, icon, meta } =
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

    return await this.addDrive(
      {
        id,
        slug,
        global: {
          name,
          icon,
        },
        local: {
          triggers: [...triggers, pullTrigger],
          listeners: listeners,
          availableOffline,
          sharingType,
        },
      },
      meta?.preferredEditor,
    );
  }

  async deleteDrive(driveId: string) {
    const result = await Promise.allSettled([
      this.stopSyncRemoteDrive(driveId),
      this.listenerManager.removeDrive(driveId),
      this.cache.deleteDrive(driveId),
      this.documentStorage.delete(driveId),
    ]);

    this.eventEmitter.emit("driveDeleted", driveId);

    result.forEach((r) => {
      if (r.status === "rejected") {
        throw r.reason;
      }
    });
  }

  // TODO: paginate
  async getDrives() {
    const drives: string[] = [];
    let cursor: string | undefined;
    do {
      const { documents, nextCursor } = await this.documentStorage.findByType(
        "powerhouse/document-drive",
        100,
        cursor,
      );

      drives.push(...documents);
      cursor = nextCursor;
    } while (cursor);

    return drives;
  }

  async getDrive(driveId: string, options?: GetDocumentOptions) {
    let document: DocumentDriveDocument | undefined;
    try {
      const cachedDocument = await this.cache.getDrive(driveId); // TODO support GetDocumentOptions
      if (cachedDocument && isDocumentDrive(cachedDocument)) {
        document = cachedDocument;
        if (isAtRevision(document, options?.revisions)) {
          return document;
        }
      }
    } catch (e) {
      this.logger.error("Error getting drive from cache", e);
    }
    const driveStorage = document ?? (await this.documentStorage.get(driveId));
    const result = this._buildDocument(driveStorage, options);
    if (!isDocumentDrive(result)) {
      throw new Error(`Document with id ${driveId} is not a Document Drive`);
    } else {
      if (!options?.revisions) {
        this.cache.setDocument(driveId, result).catch(this.logger.error);
        this.cache.setDrive(driveId, result).catch(this.logger.error);
      }
      return result;
    }
  }

  async getDriveBySlug(slug: string, options?: GetDocumentOptions) {
    try {
      const drive = await this.cache.getDriveBySlug(slug);
      if (drive) {
        return drive;
      }
    } catch (e) {
      this.logger.error("Error getting drive from cache", e);
    }

    const driveStorage = await this.documentStorage.getBySlug(slug);
    const document = this._buildDocument(driveStorage, options);
    if (!isDocumentDrive(document)) {
      throw new Error(`Document with slug ${slug} is not a Document Drive`);
    } else {
      this.cache.setDriveBySlug(slug, document).catch(this.logger.error);
      return document;
    }
  }

  async getDriveIdBySlug(slug: string): Promise<DocumentDriveDocument["id"]> {
    try {
      const drive = await this.cache.getDriveBySlug(slug);
      if (drive) {
        return drive.id;
      }
    } catch (e) {
      this.logger.error("Error getting drive from cache", e);
    }
    const driveStorage = await this.documentStorage.getBySlug(slug);
    return driveStorage.id;
  }

  async getDocument<TDocument extends PHDocument>(
    documentId: string,
    options?: GetDocumentOptions,
  ): Promise<TDocument> {
    let cachedDocument: TDocument | undefined;
    try {
      cachedDocument = await this.cache.getDocument<TDocument>(documentId); // TODO support GetDocumentOptions
      if (cachedDocument && isAtRevision(cachedDocument, options?.revisions)) {
        return cachedDocument;
      }
    } catch (e) {
      this.logger.error("Error getting document from cache", e);
    }

    const documentStorage =
      cachedDocument ?? (await this.documentStorage.get<TDocument>(documentId));
    const document = this._buildDocument<TDocument>(documentStorage, options);

    if (!options?.revisions) {
      this.cache.setDocument(documentId, document).catch(this.logger.error);
    }

    return document;
  }

  getDocuments(driveId: string) {
    return this.documentStorage.getChildren(driveId);
  }

  protected async addChild(
    parentId: string,
    documentId: string,
  ): Promise<void> {
    // TODO: check if document exists? Should that be a concern here?
    try {
      await this.documentStorage.addChild(parentId, documentId);
      const syncUnits =
        await this.synchronizationManager.getSynchronizationUnitsIds(
          undefined,
          [documentId],
        );
      await this.listenerManager.removeSyncUnits(parentId, syncUnits);
    } catch (e) {
      this.logger.error("Error adding child document", e);
      throw e;
    }
  }

  protected async removeChild(
    parentId: string,
    documentId: string,
  ): Promise<void> {
    // TODO: check if document exists? Should that be a concern here?

    // cleanup child sync units state from the parent listeners
    try {
      const childSynUnits =
        await this.synchronizationManager.getSynchronizationUnitsIds(parentId, [
          documentId,
        ]);
      await this.listenerManager.removeSyncUnits(parentId, childSynUnits);
    } catch (e) {
      this.logger.warn("Error removing sync units of child", e);
    }

    // remove child relationship from storage
    try {
      await this.documentStorage.removeChild(parentId, documentId);
    } catch (e) {
      this.logger.error("Error adding child document", e);
      throw e;
    }
  }

  protected async createDocument<TDocument extends PHDocument>(
    input: CreateDocumentInput<TDocument>,
    source: StrandUpdateSource,
    preferredEditor?: string,
  ): Promise<TDocument> {
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
      this.getDocumentModelModule(input.documentType).utils.createDocument({
        id: input.id,
        state,
      });

    if (preferredEditor) {
      const meta = document.meta ?? {};
      meta.preferredEditor = preferredEditor;
      document.meta = meta;
    }

    // stores document information
    await this.documentStorage.create(document);

    // TODO set initial state for document sync units
    // if (source.type === "trigger") {
    //   for (const scope of Object.keys(document.state)) {
    //     this.synchronizationManager.updateSyncStatus(
    //       {
    //         documentId: document.id,
    //         scope,
    //         branch: "main" /* TODO handle branches */,
    //       },
    //       {
    //         pull: "INITIAL_SYNC",
    //         push: this.listenerManager.driveHasListeners(driveId)
    //           ? "SUCCESS"
    //           : undefined,
    //       },
    //     );
    //   }
    // }

    // if the document contains operations then
    // stores the operations in the storage
    const operations = Object.values(document.operations).flat();
    if (operations.length) {
      if (isDocumentDrive(document)) {
        await this.legacyStorage.addDriveOperations(
          document.id,
          operations,
          document,
        );
      } else {
        await this.legacyStorage.addDocumentOperations(
          input.id,
          operations,
          document,
        );
      }
    }

    return document as TDocument;
  }

  async deleteDocument(documentId: string) {
    try {
      const syncUnits =
        await this.synchronizationManager.getSynchronizationUnitsIds(
          undefined,
          [documentId],
        );

      // remove document sync units status when a document is deleted
      for (const syncUnit of syncUnits) {
        this.synchronizationManager.updateSyncStatus(syncUnit, null);
      }
      const parents = await this.documentStorage.getParents(documentId);
      for (const parent of parents) {
        this.listenerManager
          .removeSyncUnits(parent, syncUnits)
          .catch(this.logger.warn);
      }
    } catch (error) {
      this.logger.warn("Error deleting document", error);
    }
    await this.cache.deleteDocument(documentId);
    await this.documentStorage.delete(documentId);
  }

  async _processOperations(
    documentId: string,
    documentStorage: PHDocument,
    operations: Operation[],
  ) {
    const operationsApplied: Operation[] = [];
    const signals: SignalResult[] = [];

    const documentStorageWithState = await this._addDocumentResultingStage(
      documentStorage,
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
    documentId: string,
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
        lastRemainingOperation.resultingState = await (isDocumentDrive(document)
          ? this.legacyStorage.getOperationResultingState?.(
              documentId,
              lastRemainingOperation.index,
              lastRemainingOperation.scope,
              "main",
            )
          : this.legacyStorage.getDriveOperationResultingState?.(
              documentId,
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

  private _buildDocument<TDocument extends PHDocument>(
    documentStorage: TDocument,
    options?: GetDocumentOptions,
  ): TDocument {
    if (
      documentStorage.state &&
      (!options || options.checkHashes === false) &&
      isAtRevision(documentStorage, options?.revisions)
    ) {
      return documentStorage;
    }

    const documentModelModule = this.getDocumentModelModule<TDocument>(
      documentStorage.documentType,
    );

    const revisionOperations =
      options?.revisions !== undefined
        ? filterOperationsByRevision(
            documentStorage.operations,
            options.revisions,
          )
        : documentStorage.operations;
    const operations = garbageCollectDocumentOperations(revisionOperations);

    return replayDocument(
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
    documentId: string,
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
      lastRemainingOperation.resultingState = await (isDocumentDrive(document)
        ? this.legacyStorage.getOperationResultingState?.(
            documentId,
            lastRemainingOperation.index,
            lastRemainingOperation.scope,
            "main",
          )
        : this.legacyStorage.getDriveOperationResultingState?.(
            documentId,
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
            handler = () => this.addChild(documentId, signal.input.id);
            break;
          case "DELETE_CHILD_DOCUMENT":
            handler = () => this.removeChild(documentId, signal.input.id);
            break;
          case "COPY_CHILD_DOCUMENT":
            handler = () => {
              throw new Error("COPY_CHILD is not implemented yet");
            };
            // this.getDocument(driveId, signal.input.id).then(
            //   (documentToCopy) => {
            //     const doc = {
            //       ...documentToCopy,
            //       slug: signal.input.newId,
            //     };

            //     return this.ensureDocument(driveId, {
            //       id: signal.input.newId,
            //       documentType: documentToCopy.documentType,
            //       document: doc,
            //       synchronizationUnits: signal.input.synchronizationUnits,
            //     });
            //   },
            // );
            break;
        }
        if (handler) {
          operationSignals.push(() =>
            handler().then((result) => ({ signal, result }) as SignalResult),
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
      this.logger.warn(JSON.stringify(appliedOperation, null, 2));
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
    documentId: string,
    operation: Operation,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.addOperations(documentId, [operation], options);
  }

  private async _addOperations(
    documentId: string,
    callback: (document: PHDocument) => Promise<{
      operations: Operation[];
      header: DocumentHeader;
    }>,
  ) {
    if (!this.legacyStorage.addDocumentOperationsWithTransaction) {
      const documentStorage =
        await this.documentStorage.get<PHDocument>(documentId);
      const result = await callback(documentStorage);
      // saves the applied operations to storage
      if (result.operations.length > 0) {
        await this.legacyStorage.addDocumentOperations(
          documentId,
          result.operations,
          result.header,
        );
      }
    } else {
      await this.legacyStorage.addDocumentOperationsWithTransaction(
        documentId,
        callback,
      );
    }
  }

  queueOperation(
    documentId: string,
    operation: Operation,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.queueOperations(documentId, [operation], options);
  }

  private async resultIfExistingOperations(
    id: string,
    operations: Operation[],
  ): Promise<IOperationResult | undefined> {
    try {
      const document = await this.getDocument(id);
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
    documentId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ) {
    // if operations are already stored then returns cached document
    const result = await this.resultIfExistingOperations(
      documentId,
      operations,
    );
    if (result) {
      return result;
    }

    // add listeners first
    let jobId: string;
    const promise = new Promise<IOperationResult>((resolve, reject) => {
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

    // now queue the job
    try {
      jobId = await this.queueManager.addJob({
        documentId,
        operations,
        options,
      });
    } catch (error) {
      this.logger.error("Error adding job", error);
      throw error;
    }

    return promise;
  }

  async queueAction(
    documentId: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.queueActions(documentId, [action], options);
  }

  async queueActions(
    documentId: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    try {
      const jobId = await this.queueManager.addJob({
        documentId,
        actions,
        options,
      });

      return await new Promise<IOperationResult>((resolve, reject) => {
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
      this.logger.error("Error adding job", error);
      throw error;
    }
  }

  async queueDriveAction(
    driveId: string,
    action: DocumentDriveAction | Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveDocument>> {
    return this.queueDriveActions(driveId, [action], options);
  }

  async queueDriveActions(
    driveId: string,
    actions: (DocumentDriveAction | Action)[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveDocument>> {
    try {
      const jobId = await this.queueManager.addJob({
        documentId: driveId,
        actions,
        options,
      });
      return await new Promise<IOperationResult<DocumentDriveDocument>>(
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
      this.logger.error("Error adding drive job", error);
      throw error;
    }
  }

  async addOperations(
    documentId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.queueOperations(documentId, operations, options);
  }

  private async processOperations(
    documentId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    // if operations are already stored then returns the result
    const result = await this.resultIfExistingOperations(
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
      await this._addOperations(documentId, async (documentStorage) => {
        const result = await this._processOperations(
          documentId,
          documentStorage,
          operations,
        );

        if (!result.document) {
          this.logger.error("Invalid document");
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
      });

      const syncUnits = new Array<SynchronizationUnit>();

      if (document) {
        this.cache.setDocument(documentId, document).catch(this.logger.error);

        // creates array of unique sync units from the applied operations
        for (const operation of operationsApplied) {
          const syncUnit: SynchronizationUnit = {
            documentId,
            documentType: document.documentType,
            scope: operation.scope,
            branch: "main", // TODO: handle branches
            revision: operation.index + 1,
            lastUpdated: operation.timestamp,
          };

          // checks if this sync unit was already added
          const exists = syncUnits.some(
            (unit) =>
              unit.documentId === syncUnit.documentId &&
              unit.scope === syncUnit.scope &&
              unit.branch === syncUnit.branch,
          );

          if (!exists) {
            syncUnits.push(syncUnit);
          }
        }
      }
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

      // TODO Decouple the operation processing from syncing it to the listeners?
      // Listener manager should be the one keeping the sync status since it depends on the listeners
      if (syncUnits.length) {
        this.listenerManager
          .updateSynchronizationRevisions(
            syncUnits,
            source,
            () => {
              this.synchronizationManager.updateSyncStatus(documentId, {
                [operationSource]: "SYNCING",
              });

              for (const syncUnit of syncUnits) {
                this.synchronizationManager.updateSyncStatus(syncUnit, {
                  [operationSource]: "SYNCING",
                });
              }
            },
            this.handleListenerError.bind(this),
            options?.forceSync ?? source.type === "local",
          )
          .then((updates) => {
            if (updates.length) {
              this.synchronizationManager.updateSyncStatus(documentId, {
                [operationSource]: "SUCCESS",
              });
            }

            for (const syncUnit of syncUnits) {
              this.synchronizationManager.updateSyncStatus(syncUnit, {
                [operationSource]: "SUCCESS",
              });
            }
          })
          .catch((error) => {
            this.logger.error(
              "Non handled error updating sync revision",
              error,
            );
            this.synchronizationManager.updateSyncStatus(
              documentId,
              {
                [operationSource]: "ERROR",
              },
              error as Error,
            );

            for (const syncUnit of syncUnits) {
              this.synchronizationManager.updateSyncStatus(
                syncUnit,
                {
                  [operationSource]: "ERROR",
                },
                error as Error,
              );
            }
          });
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

  private async _addDriveOperations(
    driveId: string,
    callback: (document: DocumentDriveDocument) => Promise<{
      operations: Operation[];
      header: DocumentHeader;
    }>,
  ) {
    if (!this.legacyStorage.addDriveOperationsWithTransaction) {
      const documentStorage =
        await this.documentStorage.get<DocumentDriveDocument>(driveId);
      const result = await callback(documentStorage);
      // saves the applied operations to storage
      if (result.operations.length > 0) {
        await this.legacyStorage.addDriveOperations(
          driveId,
          result.operations,
          result.header,
        );
      }
      return result;
    } else {
      return this.legacyStorage.addDriveOperationsWithTransaction(
        driveId,
        callback,
      );
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
        documentId: driveId,
        operations,
        options,
      });
      return await new Promise<DriveOperationResult>((resolve, reject) => {
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
      this.logger.error("Error adding drive job", error);
      throw error;
    }
  }

  async addDriveOperations(
    driveId: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult> {
    return this.queueDriveOperations(driveId, operations, options);
  }

  private async processDriveOperations(
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

      this.cache.setDocument(driveId, document).catch(this.logger.error);
      this.cache.setDrive(driveId, document).catch(this.logger.error);

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
            [
              {
                documentId: driveId,
                documentType: document.documentType,
                scope: "global",
                branch: "main",
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
            this.logger.error(
              "Non handled error updating sync revision",
              error,
            );
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
        this.startSyncRemoteDrive(driveId).catch(this.logger.error);
      } else {
        this.stopSyncRemoteDrive(driveId).catch(this.logger.error);
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
    documentId: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.addActions(documentId, [action], options);
  }

  async addActions(
    documentId: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.queueActions(documentId, actions, options);
  }

  private async processActions(
    documentId: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    const document = await this.getDocument(documentId);
    const operations = this._buildOperations(document, actions);
    return this.processOperations(documentId, operations, options);
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
    return this.queueDriveActions(driveId, actions, options);
  }

  private async processDriveActions(
    driveId: string,
    actions: (DocumentDriveAction | Action)[],
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult> {
    const document = await this.getDrive(driveId);
    const operations = this._buildOperations(document, actions);
    return this.processDriveOperations(driveId, operations, options);
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

    let result: IOperationResult;
    if (strand.documentId) {
      try {
        result = await this.queueOperations(strand.documentId, operations, {
          source,
        });
      } catch (error) {
        this.logger.error("Error queueing operations", error);
        throw error;
      }
    } else {
      try {
        result = await this.queueDriveOperations(strand.driveId, operations, {
          source,
        });
      } catch (error) {
        this.logger.error("Error queueing operations", error);
        throw error;
      }
    }

    if (result.status === "ERROR") {
      const operationSource = this.getOperationSource(source);
      this.synchronizationManager.updateSyncStatus(
        {
          documentId: strand.documentId || strand.driveId,
          scope: strand.scope,
          branch: strand.branch,
        },
        { [operationSource]: result.status },
        result.error,
      );
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
