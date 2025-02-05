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
  utils,
} from "document-model-libs/document-drive";
import {
  Action,
  BaseAction,
  utils as baseUtils,
  Document,
  DocumentHeader,
  DocumentModel,
  utils as DocumentUtils,
  Operation,
  OperationScope,
} from "document-model/document";
import { ClientError } from "graphql-request";
import { createNanoEvents, Unsubscribe } from "nanoevents";
import { ICache } from "../cache";
import InMemoryCache from "../cache/memory";
import { BaseQueueManager } from "../queue/base";
import {
  ActionJob,
  IQueueManager,
  isActionJob,
  isOperationJob,
  Job,
  OperationJob,
} from "../queue/types";
import { ReadModeServer } from "../read-mode";
import { MemoryStorage } from "../storage/memory";
import type {
  DocumentDriveStorage,
  DocumentStorage,
  IDriveStorage,
} from "../storage/types";
import {
  generateUUID,
  isBefore,
  isDocumentDrive,
  RunAsap,
  runAsapAsync,
} from "../utils";
import { DefaultDrivesManager } from "../utils/default-drives-manager";
import {
  attachBranch,
  garbageCollect,
  groupOperationsByScope,
  merge,
  precedes,
  removeExistingOperations,
  reshuffleByTimestamp,
  sortOperations,
} from "../utils/document-helpers";
import { requestPublicDrive } from "../utils/graphql";
import { logger } from "../utils/logger";
import {
  ConflictOperationError,
  DriveAlreadyExistsError,
  OperationError,
  SynchronizationUnitNotFoundError,
} from "./error";
import { ListenerManager } from "./listener";
import {
  CancelPullLoop,
  InternalTransmitter,
  IReceiver,
  ITransmitter,
  PullResponderTransmitter,
  StrandUpdateSource,
  SwitchboardPushTransmitter,
} from "./listener/transmitter";
import {
  AbstractDocumentDriveServer,
  AddOperationOptions,
  DefaultListenerManagerOptions,
  DocumentDriveServerOptions,
  DriveEvents,
  GetDocumentOptions,
  GetStrandsOptions,
  IBaseDocumentDriveServer,
  IListenerManager,
  IOperationResult,
  Listener,
  ListenerState,
  RemoteDriveAccessLevel,
  RemoteDriveOptions,
  StrandUpdate,
  SynchronizationUnitQuery,
  SyncStatus,
  SyncUnitStatusObject,
  type CreateDocumentInput,
  type DriveInput,
  type OperationUpdate,
  type SignalResult,
  type SynchronizationUnit,
} from "./types";
import { filterOperationsByRevision, isAtRevision } from "./utils";

export * from "./listener";
export type * from "./types";

export * from "../read-mode";

export const PULL_DRIVE_INTERVAL = 5000;

export class BaseDocumentDriveServer
  extends AbstractDocumentDriveServer
  implements IBaseDocumentDriveServer
{
  private emitter = createNanoEvents<DriveEvents>();
  private cache: ICache;
  private documentModels: DocumentModel[];
  private storage: IDriveStorage;
  private listenerManager: IListenerManager;
  private triggerMap = new Map<
    DocumentDriveState["id"],
    Map<Trigger["id"], CancelPullLoop>
  >();
  private syncStatus = new Map<string, SyncUnitStatusObject>();

  private queueManager: IQueueManager;
  private initializePromise: Promise<Error[] | null>;

  private defaultDrivesManager: DefaultDrivesManager;

  protected options: Required<DocumentDriveServerOptions>;

  constructor(
    documentModels: DocumentModel[],
    storage: IDriveStorage = new MemoryStorage(),
    cache: ICache = new InMemoryCache(),
    queueManager: IQueueManager = new BaseQueueManager(),
    options?: DocumentDriveServerOptions,
  ) {
    super();
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

    // todo: pull this into the constructor -- there is a circular dependency right now
    this.listenerManager = new ListenerManager(
      this,
      undefined,
      this.options.listenerManager,
    );
    this.documentModels = documentModels;
    this.storage = storage;
    this.cache = cache;
    this.queueManager = queueManager;
    this.defaultDrivesManager = new DefaultDrivesManager(
      this,
      this.defaultDrivesManagerDelegate,
      options,
    );

    this.storage.setStorageDelegate?.({
      getCachedOperations: async (drive, id) => {
        try {
          const document = await this.cache.getDocument(drive, id);
          return document?.operations;
        } catch (error) {
          logger.error(error);
          return undefined;
        }
      },
    });

    this.initializePromise = this._initialize();
  }

  setDocumentModels(models: DocumentModel[]): void {
    this.documentModels = [...models];
    this.emit("documentModels", [...models]);
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

  private getCombinedSyncUnitStatus(
    syncUnitStatus: SyncUnitStatusObject,
  ): SyncStatus {
    if (!syncUnitStatus.pull && !syncUnitStatus.push) return "INITIAL_SYNC";
    if (syncUnitStatus.pull === "INITIAL_SYNC") return "INITIAL_SYNC";
    if (syncUnitStatus.push === "INITIAL_SYNC")
      return syncUnitStatus.pull || "INITIAL_SYNC";

    const order: Array<SyncStatus> = [
      "ERROR",
      "MISSING",
      "CONFLICT",
      "SYNCING",
      "SUCCESS",
    ];
    const sortedStatus = Object.values(syncUnitStatus).sort(
      (a, b) => order.indexOf(a) - order.indexOf(b),
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return sortedStatus[0]!;
  }

  private initSyncStatus(
    syncUnitId: string,
    status: Partial<SyncUnitStatusObject>,
  ) {
    const defaultSyncUnitStatus: SyncUnitStatusObject = Object.entries(
      status,
    ).reduce((acc, [key, _status]) => {
      return {
        ...acc,
        [key]: _status !== "SYNCING" ? _status : "INITIAL_SYNC",
      };
    }, {});

    this.syncStatus.set(syncUnitId, defaultSyncUnitStatus);
    this.emit(
      "syncStatus",
      syncUnitId,
      this.getCombinedSyncUnitStatus(defaultSyncUnitStatus),
      undefined,
      defaultSyncUnitStatus,
    );
  }

  private async initializeDriveSyncStatus(
    driveId: string,
    drive: DocumentDriveDocument,
  ) {
    const syncUnits = await this.getSynchronizationUnitsIds(driveId);
    const syncStatus: SyncUnitStatusObject = {
      pull: drive.state.local.triggers.length > 0 ? "INITIAL_SYNC" : undefined,
      push: drive.state.local.listeners.length > 0 ? "SUCCESS" : undefined,
    };

    if (!syncStatus.pull && !syncStatus.push) return;

    const syncUnitsIds = [driveId, ...syncUnits.map((s) => s.syncId)];

    for (const syncUnitId of syncUnitsIds) {
      this.initSyncStatus(syncUnitId, syncStatus);
    }
  }

  private updateSyncUnitStatus(
    syncUnitId: string,
    status: Partial<SyncUnitStatusObject> | null,
    error?: Error,
  ) {
    if (status === null) {
      this.syncStatus.delete(syncUnitId);
      return;
    }

    const syncUnitStatus = this.syncStatus.get(syncUnitId);

    if (!syncUnitStatus) {
      this.initSyncStatus(syncUnitId, status);
      return;
    }

    const shouldUpdateStatus = Object.entries(status).some(
      ([key, _status]) =>
        syncUnitStatus[key as keyof SyncUnitStatusObject] !== _status,
    );

    if (shouldUpdateStatus) {
      const newstatus = Object.entries(status).reduce((acc, [key, _status]) => {
        return {
          ...acc,
          // do not replace initial_syncing if it has not finished yet
          [key]:
            acc[key as keyof SyncUnitStatusObject] === "INITIAL_SYNC" &&
            _status === "SYNCING"
              ? "INITIAL_SYNC"
              : _status,
        };
      }, syncUnitStatus);

      const previousCombinedStatus =
        this.getCombinedSyncUnitStatus(syncUnitStatus);
      const newCombinedStatus = this.getCombinedSyncUnitStatus(newstatus);

      this.syncStatus.set(syncUnitId, newstatus);

      if (previousCombinedStatus !== newCombinedStatus) {
        this.emit(
          "syncStatus",
          syncUnitId,
          this.getCombinedSyncUnitStatus(newstatus),
          error,
          newstatus,
        );
      }
    }
  }

  private async saveStrand(strand: StrandUpdate, source: StrandUpdateSource) {
    const operations: Operation[] = strand.operations.map((op) => ({
      ...op,
      scope: strand.scope,
      branch: strand.branch,
    }));

    const result = await (!strand.documentId
      ? this.queueDriveOperations(
          strand.driveId,
          operations as Operation<DocumentDriveAction | BaseAction>[],
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
        this.updateSyncUnitStatus(
          syncUnit,
          { [operationSource]: result.status },
          result.error,
        );
      }
    }
    this.emit("strandUpdate", strand);
    return result;
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

    this.updateSyncUnitStatus(driveId, { push: status }, error);
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

    const syncUnits = await this.getSynchronizationUnitsIds(
      driveId,
      undefined,
      undefined,
      undefined,
      undefined,
      drive,
    );

    for (const trigger of drive.state.local.triggers) {
      if (driveTriggers?.get(trigger.id)) {
        continue;
      }

      if (!driveTriggers) {
        driveTriggers = new Map();
      }

      this.updateSyncUnitStatus(driveId, { pull: "SYNCING" });

      for (const syncUnit of syncUnits) {
        this.updateSyncUnitStatus(syncUnit.syncId, { pull: "SYNCING" });
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

            this.updateSyncUnitStatus(driveId, { pull: statusError }, error);

            if (error instanceof ClientError) {
              this.emit(
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
              this.updateSyncUnitStatus(driveId, {
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
                    this.updateSyncUnitStatus(
                      syncUnit.syncId,
                      { pull: fileErrorRevision.status },
                      fileErrorRevision.error,
                    );
                  } else {
                    this.updateSyncUnitStatus(syncUnit.syncId, {
                      pull: "SUCCESS",
                    });
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
    this.updateSyncUnitStatus(driveId, null);

    for (const fileNodeSyncId of filesNodeSyncId) {
      this.updateSyncUnitStatus(fileNodeSyncId, null);
    }
    return this.triggerMap.delete(driveId);
  }

  private defaultDrivesManagerDelegate = {
    detachDrive: this.detachDrive.bind(this),
    emit: (...args: Parameters<DriveEvents["defaultRemoteDrive"]>) =>
      this.emit("defaultRemoteDrive", ...args),
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
        : this.addDriveOperations(
            driveId,
            operations as Operation<DocumentDriveAction | BaseAction>[],
            options,
          );
    },
    processActionJob: async ({
      driveId,
      documentId,
      actions,
      options,
    }: ActionJob) => {
      return documentId
        ? this.addActions(driveId, documentId, actions, options)
        : this.addDriveActions(
            driveId,
            actions as Operation<DocumentDriveAction | BaseAction>[],
            options,
          );
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

  private newTransmitter(transmitterType: string, listener: Listener) {
    switch (transmitterType) {
      case "SwitchboardPush": {
        return new SwitchboardPushTransmitter(listener, this);
      }
      case "Internal": {
        return new InternalTransmitter(listener, this);
      }
      default: {
        return new PullResponderTransmitter(listener, this.listenerManager);
      }
    }
  }

  private async _initializeDrive(driveId: string) {
    const drive = await this.getDrive(driveId);
    await this.initializeDriveSyncStatus(driveId, drive);

    if (this.shouldSyncRemoteDrive(drive)) {
      await this.startSyncRemoteDrive(driveId);
    }

    for (const zodListener of drive.state.local.listeners) {
      const transmitter = this.newTransmitter(
        zodListener.callInfo?.transmitterType ?? "",
        zodListener as any,
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
        system: zodListener.system,
        callInfo: zodListener.callInfo ?? undefined,
        label: zodListener.label ?? "",
      });

      await this.listenerManager.setTransmitter(
        drive.state.global.id,
        zodListener.listenerId,
        transmitter,
      );
    }
  }

  public async getSynchronizationUnits(
    driveId: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
    loadedDrive?: DocumentDriveDocument,
  ) {
    const drive = loadedDrive || (await this.getDrive(driveId));

    const synchronizationUnitsQuery = await this.getSynchronizationUnitsIds(
      driveId,
      documentId,
      scope,
      branch,
      documentType,
      drive,
    );
    return this.getSynchronizationUnitsRevision(
      driveId,
      synchronizationUnitsQuery,
      drive,
    );
  }

  public async getSynchronizationUnitsRevision(
    driveId: string,
    syncUnitsQuery: SynchronizationUnitQuery[],
    loadedDrive?: DocumentDriveDocument,
  ): Promise<SynchronizationUnit[]> {
    const drive = loadedDrive || (await this.getDrive(driveId));

    const revisions =
      await this.storage.getSynchronizationUnitsRevision(syncUnitsQuery);

    const synchronizationUnits: SynchronizationUnit[] = syncUnitsQuery.map(
      (s) => ({
        ...s,
        lastUpdated: drive.created,
        revision: -1,
      }),
    );
    for (const revision of revisions) {
      const syncUnit = synchronizationUnits.find(
        (s) =>
          revision.driveId === s.driveId &&
          revision.documentId === s.documentId &&
          revision.scope === s.scope &&
          revision.branch === s.branch,
      );
      if (syncUnit) {
        syncUnit.revision = revision.revision;
        syncUnit.lastUpdated = revision.lastUpdated;
      }
    }
    return synchronizationUnits;
  }

  public async getSynchronizationUnitsIds(
    driveId: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
    loadedDrive?: DocumentDriveDocument,
  ): Promise<SynchronizationUnitQuery[]> {
    const drive = loadedDrive ?? (await this.getDrive(driveId));
    const nodes = drive.state.global.nodes.filter(
      (node) =>
        isFileNode(node) &&
        (!documentId?.length ||
          documentId.includes(node.id) ||
          documentId.includes("*")) &&
        (!documentType?.length ||
          documentType.includes(node.documentType) ||
          documentType.includes("*")),
    ) as Pick<FileNode, "id" | "documentType" | "synchronizationUnits">[];

    // checks if document drive synchronization unit should be added
    if (
      (!documentId || documentId.includes("*") || documentId.includes("")) &&
      (!documentType?.length ||
        documentType.includes("powerhouse/document-drive") ||
        documentType.includes("*"))
    ) {
      nodes.unshift({
        id: "",
        documentType: "powerhouse/document-drive",
        synchronizationUnits: [
          {
            syncId: "0",
            scope: "global",
            branch: "main",
          },
        ],
      });
    }

    const synchronizationUnitsQuery: Omit<
      SynchronizationUnit,
      "revision" | "lastUpdated"
    >[] = [];
    for (const node of nodes) {
      const nodeUnits =
        scope?.length || branch?.length
          ? node.synchronizationUnits.filter(
              (unit) =>
                (!scope?.length ||
                  scope.includes(unit.scope) ||
                  scope.includes("*")) &&
                (!branch?.length ||
                  branch.includes(unit.branch) ||
                  branch.includes("*")),
            )
          : node.synchronizationUnits;
      if (!nodeUnits.length) {
        continue;
      }
      synchronizationUnitsQuery.push(
        ...nodeUnits.map((n) => ({
          driveId,
          documentId: node.id,
          syncId: n.syncId,
          documentType: node.documentType,
          scope: n.scope,
          branch: n.branch,
        })),
      );
    }
    return synchronizationUnitsQuery;
  }

  public async getSynchronizationUnitIdInfo(
    driveId: string,
    syncId: string,
    loadedDrive?: DocumentDriveDocument,
  ): Promise<SynchronizationUnitQuery | undefined> {
    const drive = loadedDrive || (await this.getDrive(driveId));
    const node = drive.state.global.nodes.find(
      (node) =>
        isFileNode(node) &&
        node.synchronizationUnits.find((unit) => unit.syncId === syncId),
    );

    if (!node || !isFileNode(node)) {
      return undefined;
    }

    const syncUnit = node.synchronizationUnits.find(
      (unit) => unit.syncId === syncId,
    );
    if (!syncUnit) {
      return undefined;
    }

    return {
      syncId,
      scope: syncUnit.scope,
      branch: syncUnit.branch,
      driveId,
      documentId: node.id,
      documentType: node.documentType,
    };
  }

  public async getSynchronizationUnit(
    driveId: string,
    syncId: string,
    loadedDrive?: DocumentDriveDocument,
  ): Promise<SynchronizationUnit | undefined> {
    const syncUnit = await this.getSynchronizationUnitIdInfo(
      driveId,
      syncId,
      loadedDrive,
    );

    if (!syncUnit) {
      return undefined;
    }

    const { scope, branch, documentId, documentType } = syncUnit;

    // TODO: REPLACE WITH GET DOCUMENT OPERATIONS
    const document = await this.getDocument(driveId, documentId);
    const operations = document.operations[scope as OperationScope] ?? [];
    const lastOperation = operations[operations.length - 1];

    return {
      syncId,
      scope,
      branch,
      driveId,
      documentId,
      documentType,
      lastUpdated: lastOperation?.timestamp ?? document.lastModified,
      revision: lastOperation?.index ?? 0,
    };
  }

  async getOperationData(
    driveId: string,
    syncId: string,
    filter: GetStrandsOptions,
    loadedDrive?: DocumentDriveDocument,
  ): Promise<OperationUpdate[]> {
    const syncUnit =
      syncId === "0"
        ? { documentId: "", scope: "global" }
        : await this.getSynchronizationUnitIdInfo(driveId, syncId, loadedDrive);

    if (!syncUnit) {
      throw new Error(`Invalid Sync Id ${syncId} in drive ${driveId}`);
    }

    const document =
      syncId === "0"
        ? loadedDrive || (await this.getDrive(driveId))
        : await this.getDocument(driveId, syncUnit.documentId); // TODO replace with getDocumentOperations

    const operations =
      document.operations[syncUnit.scope as OperationScope] ?? []; // TODO filter by branch also

    const filteredOperations = operations.filter(
      (operation) =>
        Object.keys(filter).length === 0 ||
        ((filter.since === undefined ||
          isBefore(filter.since, operation.timestamp)) &&
          (filter.fromRevision === undefined ||
            operation.index > filter.fromRevision)),
    );

    const limitedOperations = filter.limit
      ? filteredOperations.slice(0, filter.limit)
      : filteredOperations;

    return limitedOperations.map((operation) => ({
      hash: operation.hash,
      index: operation.index,
      timestamp: operation.timestamp,
      type: operation.type,
      input: operation.input as object,
      skip: operation.skip,
      context: operation.context,
      id: operation.id,
    }));
  }

  protected getDocumentModel(documentType: string) {
    const documentModel = this.documentModels.find(
      (model) => model.documentModel.id === documentType,
    );
    if (!documentModel) {
      throw new Error(`Document type ${documentType} not supported`);
    }
    return documentModel;
  }

  getDocumentModels() {
    return [...this.documentModels];
  }

  async addDrive(drive: DriveInput): Promise<DocumentDriveDocument> {
    const id = drive.global.id || generateUUID();
    if (!id) {
      throw new Error("Invalid Drive Id");
    }

    const drives = await this.storage.getDrives();
    if (drives.includes(id)) {
      throw new DriveAlreadyExistsError(id);
    }

    const document = utils.createDocument({
      state: drive,
    });

    await this.storage.createDrive(id, document);

    if (drive.global.slug) {
      await this.cache.deleteDocument("drives-slug", drive.global.slug);
    }

    await this._initializeDrive(id);

    this.emit("driveAdded", document);

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
    id: string,
    url: string,
    options: Pick<RemoteDriveOptions, "pullFilter" | "pullInterval">,
  ) {
    const pullTrigger =
      await PullResponderTransmitter.createPullResponderTrigger(
        id,
        url,
        options,
      );

    return pullTrigger;
  }

  async deleteDrive(id: string) {
    const result = await Promise.allSettled([
      this.stopSyncRemoteDrive(id),
      this.listenerManager.removeDrive(id),
      this.cache.deleteDocument("drives", id),
      this.storage.deleteDrive(id),
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

  async getDrive(drive: string, options?: GetDocumentOptions) {
    let document: DocumentDriveDocument | undefined;
    try {
      const cachedDocument = await this.cache.getDocument("drives", drive); // TODO support GetDocumentOptions
      if (cachedDocument && isDocumentDrive(cachedDocument)) {
        document = cachedDocument;
        if (isAtRevision(document, options?.revisions)) {
          return document;
        }
      }
    } catch (e) {
      logger.error("Error getting drive from cache", e);
    }
    const driveStorage = document ?? (await this.storage.getDrive(drive));
    const result = this._buildDocument(driveStorage, options);
    if (!isDocumentDrive(result)) {
      throw new Error(`Document with id ${drive} is not a Document Drive`);
    } else {
      if (!options?.revisions) {
        this.cache.setDocument("drives", drive, result).catch(logger.error);
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

  async getDocument(drive: string, id: string, options?: GetDocumentOptions) {
    let cachedDocument: Document | undefined;
    try {
      cachedDocument = await this.cache.getDocument(drive, id); // TODO support GetDocumentOptions
      if (cachedDocument && isAtRevision(cachedDocument, options?.revisions)) {
        return cachedDocument;
      }
    } catch (e) {
      logger.error("Error getting document from cache", e);
    }
    const documentStorage =
      cachedDocument ?? (await this.storage.getDocument(drive, id));
    const document = this._buildDocument(documentStorage, options);

    if (!options?.revisions) {
      this.cache.setDocument(drive, id, document).catch(logger.error);
    }
    return document;
  }

  getDocuments(drive: string) {
    return this.storage.getDocuments(drive);
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
      this.getDocumentModel(input.documentType).utils.createDocument();

    // stores document information
    const documentStorage: DocumentStorage = {
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
      this.initSyncStatus(syncUnit.syncId, {
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

  async deleteDocument(driveId: string, id: string) {
    try {
      const syncUnits = await this.getSynchronizationUnitsIds(driveId, [id]);

      // remove document sync units status when a document is deleted
      for (const syncUnit of syncUnits) {
        this.updateSyncUnitStatus(syncUnit.syncId, null);
      }
      await this.listenerManager.removeSyncUnits(driveId, syncUnits);
    } catch (error) {
      logger.warn("Error deleting document", error);
    }
    await this.cache.deleteDocument(driveId, id);
    return this.storage.deleteDocument(driveId, id);
  }

  async _processOperations<T extends Document, A extends Action>(
    drive: string,
    documentId: string | undefined,
    documentStorage: DocumentStorage<T>,
    operations: Operation<A | BaseAction>[],
  ) {
    const operationsApplied: Operation<A | BaseAction>[] = [];
    const signals: SignalResult[] = [];

    const documentStorageWithState = await this._addDocumentResultingStage(
      documentStorage,
      drive,
      documentId,
    );

    let document: T = this._buildDocument(documentStorageWithState);
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
        (op) => trunk.length < 1 || precedes(trunk[trunk.length - 1]!, op),
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
              drive,
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

  private async _addDocumentResultingStage<T extends Document>(
    document: DocumentStorage<T>,
    drive: string,
    documentId?: string,
    options?: GetDocumentOptions,
  ): Promise<DocumentStorage<T>> {
    // apply skip header operations to all scopes
    const operations =
      options?.revisions !== undefined
        ? filterOperationsByRevision(document.operations, options.revisions)
        : document.operations;
    const documentOperations =
      DocumentUtils.documentHelpers.garbageCollectDocumentOperations(
        operations,
      );

    for (const scope of Object.keys(documentOperations)) {
      const lastRemainingOperation =
        documentOperations[scope as OperationScope].at(-1);
      // if the latest operation doesn't have a resulting state then tries
      // to retrieve it from the db to avoid rerunning all the operations
      if (lastRemainingOperation && !lastRemainingOperation.resultingState) {
        lastRemainingOperation.resultingState = await (documentId
          ? this.storage.getOperationResultingState?.(
              drive,
              documentId,
              lastRemainingOperation.index,
              lastRemainingOperation.scope,
              "main",
            )
          : this.storage.getDriveOperationResultingState?.(
              drive,
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

  private _buildDocument<T extends Document>(
    documentStorage: DocumentStorage<T>,
    options?: GetDocumentOptions,
  ): T {
    if (
      documentStorage.state &&
      (!options || options.checkHashes === false) &&
      isAtRevision(documentStorage as unknown as Document, options?.revisions)
    ) {
      return documentStorage as T;
    }

    const documentModel = this.getDocumentModel(documentStorage.documentType);

    const revisionOperations =
      options?.revisions !== undefined
        ? filterOperationsByRevision(
            documentStorage.operations,
            options.revisions,
          )
        : documentStorage.operations;
    const operations =
      baseUtils.documentHelpers.garbageCollectDocumentOperations(
        revisionOperations,
      );

    return baseUtils.replayDocument(
      documentStorage.initialState,
      operations,
      documentModel.reducer,
      undefined,
      documentStorage,
      undefined,
      {
        ...options,
        checkHashes: options?.checkHashes ?? true,
        reuseOperationResultingState: options?.checkHashes ?? true,
      },
    ) as T;
  }

  private async _performOperation<T extends Document>(
    drive: string,
    id: string | undefined,
    document: T,
    operation: Operation,
    skipHashValidation = false,
  ) {
    const documentModel = this.getDocumentModel(document.documentType);

    const signalResults: SignalResult[] = [];
    let newDocument = document;

    const scope = operation.scope;
    const documentOperations =
      DocumentUtils.documentHelpers.garbageCollectDocumentOperations({
        ...document.operations,
        [scope]: DocumentUtils.documentHelpers.skipHeaderOperations(
          document.operations[scope],
          operation,
        ),
      });

    const lastRemainingOperation = documentOperations[scope].at(-1);
    // if the latest operation doesn't have a resulting state then tries
    // to retrieve it from the db to avoid rerunning all the operations
    if (lastRemainingOperation && !lastRemainingOperation.resultingState) {
      lastRemainingOperation.resultingState = await (id
        ? this.storage.getOperationResultingState?.(
            drive,
            id,
            lastRemainingOperation.index,
            lastRemainingOperation.scope,
            "main",
          )
        : this.storage.getDriveOperationResultingState?.(
            drive,
            lastRemainingOperation.index,
            lastRemainingOperation.scope,
            "main",
          ));
    }

    const operationSignals: (() => Promise<SignalResult>)[] = [];
    newDocument = documentModel.reducer(
      newDocument,
      operation,
      (signal) => {
        let handler: (() => Promise<unknown>) | undefined = undefined;
        switch (signal.type) {
          case "CREATE_CHILD_DOCUMENT":
            handler = () => this.createDocument(drive, signal.input);
            break;
          case "DELETE_CHILD_DOCUMENT":
            handler = () => this.deleteDocument(drive, signal.input.id);
            break;
          case "COPY_CHILD_DOCUMENT":
            handler = () =>
              this.getDocument(drive, signal.input.id).then((documentToCopy) =>
                this.createDocument(drive, {
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
    ) as T;

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
    drive: string,
    id: string,
    operation: Operation,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.addOperations(drive, id, [operation], options);
  }

  private async _addOperations(
    drive: string,
    id: string,
    callback: (document: DocumentStorage) => Promise<{
      operations: Operation[];
      header: DocumentHeader;
    }>,
  ) {
    if (!this.storage.addDocumentOperationsWithTransaction) {
      const documentStorage = await this.storage.getDocument(drive, id);
      const result = await callback(documentStorage);
      // saves the applied operations to storage
      if (result.operations.length > 0) {
        await this.storage.addDocumentOperations(
          drive,
          id,
          result.operations,
          result.header,
        );
      }
    } else {
      await this.storage.addDocumentOperationsWithTransaction(
        drive,
        id,
        callback,
      );
    }
  }

  queueOperation(
    drive: string,
    id: string,
    operation: Operation,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.queueOperations(drive, id, [operation], options);
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
    drive: string,
    id: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ) {
    // if operations are already stored then returns cached document
    const result = await this.resultIfExistingOperations(drive, id, operations);
    if (result) {
      return result;
    }
    try {
      const jobId = await this.queueManager.addJob({
        driveId: drive,
        documentId: id,
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
    drive: string,
    id: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.queueActions(drive, id, [action], options);
  }

  async queueActions(
    drive: string,
    id: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    try {
      const jobId = await this.queueManager.addJob({
        driveId: drive,
        documentId: id,
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
    drive: string,
    action: DocumentDriveAction | BaseAction,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveDocument>> {
    return this.queueDriveActions(drive, [action], options);
  }

  async queueDriveActions(
    drive: string,
    actions: (DocumentDriveAction | BaseAction)[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveDocument>> {
    try {
      const jobId = await this.queueManager.addJob({
        driveId: drive,
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
    drive: string,
    id: string,
    operations: Operation[],
    options?: AddOperationOptions,
  ) {
    // if operations are already stored then returns the result
    const result = await this.resultIfExistingOperations(drive, id, operations);
    if (result) {
      return result;
    }
    let document: Document | undefined;
    const operationsApplied: Operation[] = [];
    const signals: SignalResult[] = [];
    let error: Error | undefined;

    try {
      await this._addOperations(drive, id, async (documentStorage) => {
        const result = await this._processOperations(
          drive,
          id,
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
      });

      if (document) {
        this.cache.setDocument(drive, id, document).catch(logger.error);
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
        drive,
        [id],
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
          drive,
          syncUnits,
          source,
          () => {
            this.updateSyncUnitStatus(drive, {
              [operationSource]: "SYNCING",
            });

            for (const syncUnit of syncUnits) {
              this.updateSyncUnitStatus(syncUnit.syncId, {
                [operationSource]: "SYNCING",
              });
            }
          },
          this.handleListenerError.bind(this),
          options?.forceSync ?? source.type === "local",
        )
        .then((updates) => {
          if (updates.length) {
            this.updateSyncUnitStatus(drive, {
              [operationSource]: "SUCCESS",
            });
          }

          for (const syncUnit of syncUnits) {
            this.updateSyncUnitStatus(syncUnit.syncId, {
              [operationSource]: "SUCCESS",
            });
          }
        })
        .catch((error) => {
          logger.error("Non handled error updating sync revision", error);
          this.updateSyncUnitStatus(
            drive,
            {
              [operationSource]: "ERROR",
            },
            error as Error,
          );

          for (const syncUnit of syncUnits) {
            this.updateSyncUnitStatus(
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
    drive: string,
    operation: Operation<DocumentDriveAction | BaseAction>,
    options?: AddOperationOptions,
  ) {
    return this.addDriveOperations(drive, [operation], options);
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
    }>,
  ) {
    if (!this.storage.addDriveOperationsWithTransaction) {
      const documentStorage = await this.storage.getDrive(drive);
      const result = await callback(documentStorage);
      // saves the applied operations to storage
      if (result.operations.length > 0) {
        await this.storage.addDriveOperations(
          drive,
          result.operations,
          result.header,
        );
      }
      return result;
    } else {
      return this.storage.addDriveOperationsWithTransaction(drive, callback);
    }
  }

  queueDriveOperation(
    drive: string,
    operation: Operation<DocumentDriveAction | BaseAction>,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveDocument>> {
    return this.queueDriveOperations(drive, [operation], options);
  }

  private async resultIfExistingDriveOperations(
    driveId: string,
    operations: Operation<DocumentDriveAction | BaseAction>[],
  ): Promise<IOperationResult<DocumentDriveDocument> | undefined> {
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
        } as IOperationResult<DocumentDriveDocument>;
      } else {
        return undefined;
      }
    } catch (error) {
      console.error(error); // TODO error
      return undefined;
    }
  }

  async queueDriveOperations(
    drive: string,
    operations: Operation<DocumentDriveAction | BaseAction>[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveDocument>> {
    // if operations are already stored then returns cached document
    const result = await this.resultIfExistingDriveOperations(
      drive,
      operations,
    );
    if (result) {
      return result;
    }
    try {
      const jobId = await this.queueManager.addJob({
        driveId: drive,
        operations,
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

  async addDriveOperations(
    drive: string,
    operations: Operation<DocumentDriveAction | BaseAction>[],
    options?: AddOperationOptions,
  ) {
    let document: DocumentDriveDocument | undefined;
    const operationsApplied: Operation<DocumentDriveAction | BaseAction>[] = [];
    const signals: SignalResult[] = [];
    let error: Error | undefined;

    // if operations are already stored then returns cached drive
    const result = await this.resultIfExistingDriveOperations(
      drive,
      operations,
    );
    if (result) {
      return result;
    }

    try {
      await this._addDriveOperations(drive, async (documentStorage) => {
        const result = await this._processOperations<
          DocumentDriveDocument,
          DocumentDriveAction
        >(drive, undefined, documentStorage, operations.slice());
        document = result.document;
        operationsApplied.push(...result.operationsApplied);
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

      this.cache.setDocument("drives", drive, document).catch(logger.error);

      for (const operation of operationsApplied) {
        switch (operation.type) {
          case "ADD_LISTENER": {
            const zodListener = operation.input.listener;
            const transmitter = this.newTransmitter(
              zodListener.callInfo?.transmitterType ?? "",
              zodListener as any,
            );

            await this.addListener(drive, transmitter, operation);
            break;
          }
          case "REMOVE_LISTENER": {
            await this.removeListener(drive, operation);
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
            drive,
            [
              {
                syncId: "0",
                driveId: drive,
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
              this.updateSyncUnitStatus(drive, {
                [operationSource]: "SYNCING",
              });
            },
            this.handleListenerError.bind(this),
            options?.forceSync ?? source.type === "local",
          )
          .then((updates) => {
            if (updates.length) {
              this.updateSyncUnitStatus(drive, {
                [operationSource]: "SUCCESS",
              });
            }
          })
          .catch((error) => {
            logger.error("Non handled error updating sync revision", error);
            this.updateSyncUnitStatus(
              drive,
              { [operationSource]: "ERROR" },
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

  private _buildOperations<T extends Action>(
    document: Document,
    actions: (T | BaseAction)[],
  ): Operation<T | BaseAction>[] {
    const operations: Operation<T | BaseAction>[] = [];
    const { reducer } = this.getDocumentModel(document.documentType);
    for (const action of actions) {
      document = reducer(document, action);
      const operation = document.operations[action.scope].slice().pop();
      if (!operation) {
        throw new Error("Error creating operations");
      }
      operations.push(operation);
    }
    return operations;
  }

  async addAction(
    drive: string,
    id: string,
    action: Action,
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    return this.addActions(drive, id, [action], options);
  }

  async addActions(
    drive: string,
    id: string,
    actions: Action[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult> {
    const document = await this.getDocument(drive, id);
    const operations = this._buildOperations(document, actions);
    return this.addOperations(drive, id, operations, options);
  }

  async addDriveAction(
    drive: string,
    action: DocumentDriveAction | BaseAction,
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveDocument>> {
    return this.addDriveActions(drive, [action], options);
  }

  async addDriveActions(
    drive: string,
    actions: (DocumentDriveAction | BaseAction)[],
    options?: AddOperationOptions,
  ): Promise<IOperationResult<DocumentDriveDocument>> {
    const document = await this.getDrive(drive);
    const operations = this._buildOperations(document, actions);
    const result = await this.addDriveOperations(drive, operations, options);
    return result;
  }

  async detachDrive(driveId: string) {
    const documentDrive = await this.getDrive(driveId);
    const listeners = documentDrive.state.local.listeners || [];
    const triggers = documentDrive.state.local.triggers || [];

    for (const listener of listeners) {
      await this.addDriveAction(
        driveId,
        actions.removeListener({ listenerId: listener.listenerId }),
      );
    }

    for (const trigger of triggers) {
      await this.addDriveAction(
        driveId,
        actions.removeTrigger({ triggerId: trigger.id }),
      );
    }

    await this.addDriveAction(
      driveId,
      actions.setSharingType({ type: "LOCAL" }),
    );
  }

  private async addListener(
    driveId: string,
    transmitter: ITransmitter,
    operation: Operation<Action<"ADD_LISTENER", AddListenerInput>>,
  ) {
    const { listener: zodListener } = operation.input;

    await this.listenerManager.setListener(driveId, {
      ...zodListener,
      driveId,
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
    });

    await this.listenerManager.setTransmitter(
      driveId,
      zodListener.listenerId,
      transmitter,
    );
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
    await this.addDriveAction(driveId, actions.addListener({ listener }));
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
    operation: Operation<Action<"REMOVE_LISTENER", RemoveListenerInput>>,
  ) {
    const { listenerId } = operation.input;
    await this.listenerManager.removeListener(driveId, listenerId);
  }

  getTransmitter(
    driveId: string,
    listenerId: string,
  ): Promise<ITransmitter | undefined> {
    return this.listenerManager.getTransmitter(driveId, listenerId);
  }

  getListener(
    driveId: string,
    listenerId: string,
  ): Promise<ListenerState | undefined> {
    return this.listenerManager.getListener(driveId, listenerId);
  }

  getSyncStatus(
    syncUnitId: string,
  ): SyncStatus | SynchronizationUnitNotFoundError {
    const status = this.syncStatus.get(syncUnitId);
    if (!status) {
      return new SynchronizationUnitNotFoundError(
        `Sync status not found for syncUnitId: ${syncUnitId}`,
        syncUnitId,
      );
    }
    return this.getCombinedSyncUnitStatus(status);
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

export const DocumentDriveServer = ReadModeServer(BaseDocumentDriveServer);
