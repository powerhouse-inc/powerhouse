/* eslint-disable @typescript-eslint/no-deprecated */
// TODO remove this when drive methods are deleted
import { type AddFileAction } from "#drive-document-model/gen/actions";
import {
  removeListener,
  removeTrigger,
  setSharingType,
} from "#drive-document-model/gen/creators";
import { createDocument } from "#drive-document-model/gen/utils";
import { type LegacyAddFileAction } from "#drive-document-model/module";
import {
  type ActionJob,
  type DocumentJob,
  type IQueueManager,
  type Job,
  type OperationJob,
  isActionJob,
  isDocumentJob,
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
import { requestPublicDriveWithTokenFromReactor } from "#utils/graphql";
import { isDocumentDrive, runAsapAsync } from "#utils/misc";
import { RunAsap } from "#utils/run-asap";
import {
  DocumentAlreadyExistsError,
  type DocumentDriveAction,
  type DocumentDriveDocument,
  type Trigger,
  childLogger,
} from "document-drive";
import {
  type Action,
  type DocumentModelModule,
  type Operation,
  type PHDocument,
  type PHDocumentHeader,
  type PHDocumentMeta,
  type SignalResult,
  attachBranch,
  createPresignedHeader,
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
  validateHeader,
} from "document-model";
import { ClientError } from "graphql-request";
import { type Unsubscribe } from "nanoevents";
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
import {
  filterOperationsByRevision,
  isAtRevision,
  resolveCreateDocumentInput,
} from "./utils.js";

export class BaseDocumentDriveServer
  implements IBaseDocumentDriveServer, IDefaultDrivesManager
{
  protected logger = childLogger(["BaseDocumentDriveServer"]);

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
  public generateJwtHandler?: (driveUrl: string) => Promise<string>;

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
        ? this.processDriveActions(documentId, actions, options)
        : this.processActions(documentId, actions, options);
    },
    processDocumentJob: async ({
      documentId,
      documentType,
      initialState,
      options,
    }: DocumentJob): Promise<IOperationResult> => {
      const documentModelModule = this.getDocumentModelModule(documentType);
      const document = documentModelModule.utils.createDocument({
        ...initialState,
      });
      // TODO: header must be included
      const header = createPresignedHeader(documentId, documentType);
      document.header.id = documentId;
      document.header.sig = header.sig;
      document.header.documentType = documentType;

      try {
        const createdDocument = await this.createDocument(
          { document },
          options?.source ?? { type: "local" },
          initialState?.header.meta,
        );
        return {
          status: "SUCCESS",
          operations: [],
          document: createdDocument,
          signals: [],
        };
      } catch (error) {
        const cause =
          error instanceof Error ? error : new Error(JSON.stringify(error));
        return {
          status: "ERROR",
          error: new OperationError(
            "ERROR",
            undefined,
            `Error creating document: ${cause.message}`,
            cause,
          ),
          operations: [],
          document: undefined,
          signals: [],
        };
      }
    },
    processJob: async (job: Job) => {
      if (isOperationJob(job)) {
        return this.queueDelegate.processOperationJob(job);
      } else if (isActionJob(job)) {
        return this.queueDelegate.processActionJob(job);
      } else if (isDocumentJob(job)) {
        return this.queueDelegate.processDocumentJob(job);
      } else {
        throw new Error("Unknown job type", job);
      }
    },
  };

  // internal state
  private triggerMap = new Map<
    PHDocumentHeader["id"],
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
      jwtHandler:
        options?.jwtHandler === undefined
          ? () => Promise.resolve("")
          : options.jwtHandler,
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
          async (revisions) => {
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
            // then updates drive documents to "SUCCESS" and
            // updates corresponding push transmitter
            if (firstPull) {
              firstPull = false;

              const syncUnitsIds =
                await this.synchronizationManager.getSynchronizationUnitsIds(
                  driveId,
                );
              const unchangedSyncUnits = syncUnitsIds.filter((syncUnit) => {
                return !revisions.find((revision) => {
                  return (
                    revision.documentId === syncUnit.documentId &&
                    revision.scope === syncUnit.scope &&
                    revision.branch === syncUnit.branch
                  );
                });
              });
              unchangedSyncUnits.forEach((syncUnit) => {
                this.synchronizationManager.updateSyncStatus(syncUnit, {
                  pull: "SUCCESS",
                });
              });

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
          undefined,
          this.listeners,
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
      `[SYNC DEBUG] Initializing drive ${driveId} with slug "${drive.header.slug}"`,
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
          this.listeners,
        );

        this.logger.verbose(
          `[SYNC DEBUG] Created SwitchboardPush transmitter with URL: ${zodListener.callInfo.data || "none"}`,
        );

        await this.listenerManager
          .setListener(driveId, {
            block: zodListener.block,
            driveId: drive.header.id,
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
    document: TDocument,
    meta?: PHDocumentMeta,
  ): Promise<TDocument> {
    return this.createDocument({ document }, { type: "local" }, meta);
  }

  async addDrive(
    input: DriveInput,
    preferredEditor?: string,
  ): Promise<DocumentDriveDocument> {
    const document = createDocument({
      state: {
        global: {
          icon: input.global.icon ?? null,
          name: input.global.name,
        },
        local: input.local ?? {},
      },
    });

    if (input.id && input.id.length > 0) {
      document.header.id = input.id;
    }

    if (input.slug && input.slug.length > 0) {
      document.header.slug = input.slug;
    }

    if (preferredEditor) {
      document.header.meta = {
        preferredEditor: preferredEditor,
      };
    }

    await this.documentStorage.create(document);

    if (input.slug && input.slug.length > 0) {
      await this.cache.deleteDriveBySlug(input.slug);
    }

    await this._initializeDrive(document.header.id);

    this.eventEmitter.emit("driveAdded", document);

    return document;
  }

  async addRemoteDrive(
    url: string,
    options: RemoteDriveOptions,
  ): Promise<DocumentDriveDocument> {
    const token = await this.generateJwtHandler?.(url);
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    const { id, name, slug, icon, meta } =
      options.expectedDriveInfo ||
      (await requestPublicDriveWithTokenFromReactor(url, this));

    const {
      pullFilter,
      pullInterval,
      availableOffline,
      sharingType,
      listeners,
      triggers,
    } = options;

    const pullTrigger =
      await PullResponderTransmitter.createPullResponderTrigger(
        id,
        url,
        {
          pullFilter,
          pullInterval,
        },
        this.listeners,
      );

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

  // TODO: paginate, move into IReactorClient eventually
  async getDrivesSlugs() {
    const drives = await this.getDrives();
    return this.documentStorage.resolveSlugs(drives);
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

  async getDriveIdBySlug(slug: string): Promise<string> {
    try {
      const drive = await this.cache.getDriveBySlug(slug);
      if (drive) {
        return drive.header.id;
      }
    } catch (e) {
      this.logger.error("Error getting drive from cache", e);
    }

    const driveStorage = await this.documentStorage.getBySlug(slug);
    return driveStorage.header.id;
  }

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
  getDocument<TDocument extends PHDocument>(
    driveId: string,
    documentId?: string | GetDocumentOptions,
    options?: GetDocumentOptions,
  ): Promise<TDocument> | Promise<TDocument> {
    const id = typeof documentId === "string" ? documentId : driveId;
    const resolvedOptions =
      typeof documentId === "object" ? documentId : options;
    return this._getDocument<TDocument>(id, resolvedOptions);
  }

  private async _getDocument<TDocument extends PHDocument>(
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
      // TODO: update listener manager?
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
    meta?: PHDocumentMeta,
  ): Promise<TDocument> {
    const { documentType, document: inputDocument } =
      resolveCreateDocumentInput(input);

    // if a document was provided then checks if it's valid
    let state = undefined;
    if (inputDocument) {
      if (
        "documentType" in input &&
        documentType !== inputDocument.header.documentType
      ) {
        throw new Error(`Provided document is not ${documentType}`);
      }

      const doc = this._buildDocument(inputDocument);
      state = doc.state;
    }

    // if no document was provided then create a new one
    const document =
      inputDocument ??
      this.getDocumentModelModule(documentType).utils.createDocument({
        state,
      });

    // get the header
    let header: PHDocumentHeader;

    // handle the legacy case where an id is provided
    if ("id" in input && input.id) {
      if (inputDocument) {
        header = document.header;

        document.header.id = input.id;

        this.logger.warn(
          "Assigning an id to a document is deprecated. Use the header field instead.",
        );
      } else {
        this.logger.warn(
          "Creating a document with an id is deprecated. Use the header field instead.",
        );

        header = createPresignedHeader(input.id, documentType);
      }
    } else if ("header" in input) {
      // validate the header passed in
      await validateHeader(input.header);

      header = input.header;
    } else if (inputDocument?.header) {
      if (!inputDocument.header.id) {
        throw new Error("Document header id is required");
      }
      if (!inputDocument.header.documentType) {
        throw new Error("Document header documentType is required");
      }
      if (!inputDocument.header.createdAtUtcIso) {
        throw new Error("Document header createdAtUtcIso is required");
      }

      if (!inputDocument.header.sig.nonce) {
        this.logger.warn(
          "Creating a document with an unsigned id is deprecated. Use createSignedHeaderForSigner.",
        );
        // throw new Error("Document header sig nonce is required"); TODO: uncomment when ready to enforce signed documents
      } else {
        await validateHeader(inputDocument.header);
      }

      header = inputDocument.header;
    } else {
      // otherwise, generate a header
      header = createPresignedHeader(undefined, documentType);
    }

    if (meta) {
      header.meta = { ...header.meta, ...meta };
    }

    // stores document information
    const documentStorage: PHDocument = {
      header,
      history: document.history,
      operations: { global: [], local: [] },
      initialState: document.initialState,
      clipboard: [],
      attachments: document.attachments,
      state: state ?? document.state,
    };

    await this.documentStorage.create(documentStorage);

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
          header.id,
          operations,
          document,
        );
      } else {
        await this.legacyStorage.addDocumentOperations(
          header.id,
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
      const storageDocumentOperations = documentStorage.operations[scope];

      // TODO two equal operations done by two clients will be considered the same, ie: { type: "INCREMENT" }
      const branch = removeExistingOperations(
        operationsByScope[scope] || [],
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
      documentStorage.header.documentType,
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
      documentStorage.header,
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
      document.header.documentType,
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
            handler = () => this.addChild(documentId, signal.input.newId);
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
  addOperation(
    driveIdOrDocumentId: string,
    documentIdOrOperation: string | Operation,
    operationOrOptions?: Operation | AddOperationOptions,
    maybeOptions?: AddOperationOptions,
  ): Promise<IOperationResult> {
    let documentId: string;
    let operation: Operation;
    let options: AddOperationOptions | undefined;

    if (typeof documentIdOrOperation === "string") {
      // Deprecated overload: (driveId, documentId, operation, options)
      documentId = documentIdOrOperation;
      operation = operationOrOptions as Operation;
      options = maybeOptions;
    } else {
      // Standard overload: (documentId, operation, options)
      documentId = driveIdOrDocumentId;
      operation = documentIdOrOperation;
      options = operationOrOptions as AddOperationOptions | undefined;
    }
    return this.addOperations(documentId, [operation], options);
  }

  private async _addOperations(
    documentId: string,
    callback: (document: PHDocument) => Promise<{
      operations: Operation[];
      document: PHDocument;
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
          result.document,
        );
      }
    } else {
      await this.legacyStorage.addDocumentOperationsWithTransaction(
        documentId,
        callback,
      );
    }
  }

  async queueDocument<TDocument extends PHDocument>(
    input: CreateDocumentInput<TDocument>,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    const { id, documentType, document } = resolveCreateDocumentInput(input);
    if (!id) {
      throw new Error("Document id is required", { cause: input });
    }
    if (!documentType) {
      throw new Error("Document type is required", { cause: input });
    }

    const exists = await this.documentStorage.exists(id);
    if (exists) {
      throw new DocumentAlreadyExistsError(id);
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
        documentId: id,
        documentType,
        initialState: document,
        options,
      });
    } catch (error) {
      this.logger.error("Error adding job", error);
      throw error;
    }

    return promise;
  }

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
  queueOperation(
    driveIdOrDocumentId: string,
    documentIdOrOperation: string | Operation,
    operationOrOptions?: Operation | AddOperationOptions,
    maybeOptions?: AddOperationOptions,
  ): Promise<IOperationResult> {
    let documentId: string;
    let operation: Operation;
    let options: AddOperationOptions | undefined;

    if (typeof documentIdOrOperation === "string") {
      // Deprecated overload: (driveId, documentId, operation, options)
      documentId = documentIdOrOperation;
      operation = operationOrOptions as Operation;
      options = maybeOptions;
    } else {
      // Standard overload: (documentId, operation, options)
      documentId = driveIdOrDocumentId;
      operation = documentIdOrOperation;
      options = operationOrOptions as AddOperationOptions | undefined;
    }
    return this._queueOperations(documentId, [operation], options);
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
            (existingOp: Operation) =>
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
  queueOperations(
    driveIdOrDocumentId: string,
    documentIdOrOperations: string | Operation[],
    operationsOrOptions?: Operation[] | AddOperationOptions,
    maybeOptions?: AddOperationOptions,
  ): Promise<IOperationResult> {
    let documentId: string;
    let operations: Operation[];
    let options: AddOperationOptions | undefined;

    if (typeof documentIdOrOperations === "string") {
      // Deprecated overload: (driveId, documentId, operations, options)
      documentId = documentIdOrOperations;
      operations = operationsOrOptions as Operation[];
      options = maybeOptions;
    } else {
      // Standard overload: (documentId, operations, options)
      documentId = driveIdOrDocumentId;
      operations = documentIdOrOperations;
      options = operationsOrOptions as AddOperationOptions | undefined;
    }
    return this._queueOperations(documentId, operations, options);
  }

  private async _queueOperations(
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
  queueAction(
    driveIdOrDocumentId: string,
    documentIdOrAction: string | Action,
    actionOrOptions?: Action | AddOperationOptions,
    maybeOptions?: AddOperationOptions,
  ): Promise<IOperationResult> {
    let documentId: string;
    let action: Action;
    let options: AddOperationOptions | undefined;

    if (typeof documentIdOrAction === "string") {
      // Deprecated overload: (driveId, documentId, action, options)
      documentId = documentIdOrAction;
      action = actionOrOptions as Action;
      options = maybeOptions;
    } else {
      // Standard overload: (documentId, action, options)
      documentId = driveIdOrDocumentId;
      action = documentIdOrAction;
      options = actionOrOptions as AddOperationOptions | undefined;
    }
    return this._queueActions(documentId, [action], options);
  }

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
  queueActions(
    driveIdOrDocumentId: string,
    documentIdOrActions: string | Action[],
    actionsOrOptions?: Action[] | AddOperationOptions,
    maybeOptions?: AddOperationOptions,
  ): Promise<IOperationResult> {
    let documentId: string;
    let actions: Action[];
    let options: AddOperationOptions | undefined;

    if (typeof documentIdOrActions === "string") {
      // Deprecated overload: (driveId, documentId, actions, options)
      documentId = documentIdOrActions;
      actions = actionsOrOptions as Action[];
      options = maybeOptions;
    } else {
      // Standard overload: (documentId, actions, options)
      documentId = driveIdOrDocumentId;
      actions = documentIdOrActions;
      options = actionsOrOptions as AddOperationOptions | undefined;
    }
    return this._queueActions(documentId, actions, options);
  }

  private async _queueActions(
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

  /**
   * @deprecated Use the {@link queueAction} method instead.
   */
  async queueDriveAction(
    driveId: string,
    action: DocumentDriveAction | Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveDocument>> {
    return this.queueDriveActions(driveId, [action], options);
  }

  /**
   * @deprecated Use the {@link queueActions} method instead.
   */
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
  addOperations(
    driveIdOrDocumentId: string,
    documentIdOrOperations: string | Operation[],
    operationsOrOptions?: Operation[] | AddOperationOptions,
    maybeOptions?: AddOperationOptions,
  ): Promise<IOperationResult> {
    let documentId: string;
    let operations: Operation[];
    let options: AddOperationOptions | undefined;

    if (typeof documentIdOrOperations === "string") {
      // Deprecated overload: (driveId, documentId, operations, options)
      documentId = documentIdOrOperations;
      operations = operationsOrOptions as Operation[];
      options = maybeOptions;
    } else {
      // Standard overload: (documentId, operations, options)
      documentId = driveIdOrDocumentId;
      operations = documentIdOrOperations;
      options = operationsOrOptions as AddOperationOptions | undefined;
    }
    return this._queueOperations(documentId, operations, options);
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
          document: result.document,
        };
      });

      const syncUnits = new Array<SynchronizationUnit>();

      if (document) {
        this.cache.setDocument(documentId, document).catch(this.logger.error);

        // creates array of unique sync units from the applied operations
        for (const operation of operationsApplied) {
          const syncUnit: SynchronizationUnit = {
            documentId,
            documentType: document.header.documentType,
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

      this.eventEmitter.emit("documentOperationsAdded", documentId, operations);

      this.eventEmitter.emit("operationsAdded", documentId, operations);

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

  /**
   * @deprecated Use the {@link addOperation} method instead.
   */
  addDriveOperation(
    driveId: string,
    operation: Operation,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult> {
    return this.addDriveOperations(driveId, [operation], options);
  }

  private async _addDriveOperations(
    driveId: string,
    callback: (document: DocumentDriveDocument) => Promise<{
      operations: Operation[];
      document: PHDocument;
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
          result.document,
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

  /**
   * @deprecated Use the {@link queueOperation} method instead.
   */
  queueDriveOperation(
    driveId: string,
    operation: Operation,
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
            (existingOp: Operation) =>
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

  /**
   * @deprecated Use the {@link queueOperations} method instead.
   */
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

  /**
   * @deprecated Use the {@link addOperations} method instead.
   */
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
    const operationsApplied: Operation[] = [];
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
        operationsApplied.push(...result.operationsApplied);
        signals.push(...result.signals);
        error = result.error;

        return {
          operations: result.operationsApplied,
          document: result.document,
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
                documentType: document.header.documentType,
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

      this.eventEmitter.emit("driveOperationsAdded", driveId, operations);
      this.eventEmitter.emit("operationsAdded", driveId, operations);

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
              error,
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
  ): Operation[] {
    const operations: Operation[] = [];
    const { reducer } = this.getDocumentModelModule(
      documentId.header.documentType,
    );
    for (const action of actions) {
      documentId = reducer(documentId, action);
      const operation = documentId.operations[action.scope].slice().pop();
      if (!operation) {
        throw new Error("Error creating operations");
      }
      operations.push(operation);
    }
    return operations;
  }

  /**
   * @deprecated Use addAction(documentId, action, options) instead. This method will be removed in the future.
   */
  /**
   * @deprecated Use addAction(documentId, action, options) instead. This method will be removed in the future.
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
  addAction(
    driveIdOrDocumentId: string,
    documentIdOrAction: string | Action,
    actionOrOptions?: Action | AddOperationOptions,
    maybeOptions?: AddOperationOptions,
  ): Promise<IOperationResult> {
    let documentId: string;
    let action: Action;
    let options: AddOperationOptions | undefined;

    if (typeof documentIdOrAction === "string") {
      // Deprecated overload: (driveId, documentId, action, options)
      documentId = documentIdOrAction;
      action = actionOrOptions as Action;
      options = maybeOptions;
    } else {
      // Standard overload: (documentId, action, options)
      documentId = driveIdOrDocumentId;
      action = documentIdOrAction;
      options = actionOrOptions as AddOperationOptions | undefined;
    }
    return this._addAction(documentId, action, options);
  }

  private async _addAction(
    documentId: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.addActions(documentId, [action], options);
  }

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
  addActions(
    driveIdOrDocumentId: string,
    documentIdOrActions: string | Action[],
    actionsOrOptions?: Action[] | AddOperationOptions,
    maybeOptions?: AddOperationOptions,
  ): Promise<IOperationResult> {
    let documentId: string;
    let actions: Action[];
    let options: AddOperationOptions | undefined;

    if (typeof documentIdOrActions === "string") {
      // Deprecated overload: (driveId, documentId, actions, options)
      documentId = documentIdOrActions;
      actions = actionsOrOptions as Action[];
      options = maybeOptions;
    } else {
      // Standard overload: (documentId, actions, options)
      documentId = driveIdOrDocumentId;
      actions = documentIdOrActions;
      options = actionsOrOptions as AddOperationOptions | undefined;
    }
    return this._queueActions(documentId, actions, options);
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

  /**
   * @deprecated Use the {@link addAction} method instead with a {@link AddFileAction} and call {@link addDocument} if the document needs to be created.
   */
  /**
   * @deprecated Use the {@link addAction} method instead with a {@link AddFileAction} and call {@link addDocument} if the document needs to be created.
   */
  async addDriveAction(
    driveId: string,
    action: LegacyAddFileAction,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;
  /**
   * @deprecated Use the {@link addAction} method instead.
   */
  async addDriveAction(
    driveId: string,
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    action: DocumentDriveAction | Action,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult>;
  /**
   * @deprecated Use the {@link addAction} method instead.
   */
  async addDriveAction(
    driveId: string,

    action: LegacyAddFileAction | DocumentDriveAction | Action,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult> {
    if ("synchronizationUnits" in (action as LegacyAddFileAction).input) {
      return this._legacyAddFileAction(
        driveId,
        action as LegacyAddFileAction,
        options,
      );
    }

    return this.addDriveActions(driveId, [action], options);
  }

  private async _legacyAddFileAction(
    driveId: string,
    action: LegacyAddFileAction,
    options?: AddOperationOptions,
  ): Promise<DriveOperationResult> {
    // create document before adding it to the drive
    const document = this.getDocumentModelModule(
      action.input.documentType,
    ).utils.createDocument({ ...action.input.document });
    document.header.id = action.input.id;
    document.header.name = action.input.name;
    document.header.documentType = action.input.documentType;
    await this.queueDocument(
      { document },
      { source: options?.source || { type: "local" } },
    );

    // create updated version of the ADD_FILE action
    const newAction: AddFileAction = {
      ...action,
      input: {
        id: action.input.id,
        documentType: document.header.documentType,
        name: action.input.name,
        parentFolder: action.input.parentFolder,
      },
    };
    return (await this.addAction(
      driveId,
      newAction,
      options,
    )) as IOperationResult<DocumentDriveDocument>;
  }

  /**
   * @deprecated Use the {@link addActions} method instead.
   */
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
    documentId: string,
    scope?: string,
    branch?: string,
  ): SyncStatus | SynchronizationUnitNotFoundError {
    return this.synchronizationManager.getSyncStatus(documentId, scope, branch);
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
  private async saveStrand(
    strand: StrandUpdate,
    source: StrandUpdateSource,
  ): Promise<IOperationResult> {
    const isNewDocument = !(await this.documentStorage.exists(
      strand.documentId,
    ));

    let result: IOperationResult | undefined = undefined;

    if (isNewDocument) {
      result = await this.queueDocument({
        id: strand.documentId,
        documentType: strand.documentType,
      });
    }

    const operations: Operation[] = strand.operations.map(
      (op: OperationUpdate) => ({
        ...op,
        scope: strand.scope,
        branch: strand.branch,
      }),
    );

    // if document already existed or queueDocument
    // was successful, queues the operations
    if ((!isNewDocument || result?.status === "SUCCESS") && operations.length) {
      try {
        result = await this.queueOperations(strand.documentId, operations, {
          source,
        });
      } catch (error) {
        this.logger.error("Error queueing operations", error);
        throw error;
      }
    }

    if (!result) {
      this.logger.debug(`Document ${strand.documentId} already exists`);
      return {
        status: "SUCCESS",
        document: await this.getDocument(strand.documentId),
        operations: [],
        signals: [],
      } satisfies IOperationResult;
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

  setGenerateJwtHandler(handler: (driveUrl: string) => Promise<string>) {
    this.generateJwtHandler = handler;
    this.listenerManager.setGenerateJwtHandler(handler);
  }

  removeJwtHandler() {
    this.generateJwtHandler = undefined;
    this.listenerManager.removeJwtHandler();
  }
}

export type DocumentDriveServerConstructor =
  Constructor<BaseDocumentDriveServer>;

export type DocumentDriveServerMixin<I> = Mixin<
  typeof BaseDocumentDriveServer,
  I
>;

export const DocumentDriveServer = ReadModeServer(BaseDocumentDriveServer);
