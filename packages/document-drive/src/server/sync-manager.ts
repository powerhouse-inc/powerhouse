import { type ICache } from "#cache/types";
import {
  type DocumentDriveDocument,
  type FileNode,
} from "#drive-document-model/gen/types";
import { isFileNode } from "#drive-document-model/src/utils";
import {
  type IDocumentStorage,
  type IDriveOperationStorage,
} from "#storage/types";
import { childLogger } from "#utils/logger";
import { isBefore, isDocumentDrive } from "#utils/misc";
import {
  type DocumentModelModule,
  type OperationScope,
  type PHDocument,
  garbageCollectDocumentOperations,
  replayDocument,
} from "document-model";
import { SynchronizationUnitNotFoundError } from "./error.js";
import {
  type GetStrandsOptions,
  type IEventEmitter,
  type ISynchronizationManager,
  type OperationUpdate,
  type SyncStatus,
  type SyncUnitStatusObject,
  type SynchronizationUnit,
  type SynchronizationUnitQuery,
} from "./types.js";

export default class SynchronizationManager implements ISynchronizationManager {
  private syncStatus = new Map<string, SyncUnitStatusObject>();

  private logger = childLogger(["SynchronizationManager"]);

  constructor(
    private readonly storage: IDriveOperationStorage,
    private readonly documentStorage: IDocumentStorage,
    private readonly cache: ICache,
    private documentModelModules: DocumentModelModule[],
    private readonly eventEmitter?: IEventEmitter,
  ) {}

  async getSynchronizationUnits(
    driveId: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
  ): Promise<SynchronizationUnit[]> {
    const synchronizationUnitsQuery = await this.getSynchronizationUnitsIds(
      driveId,
      documentId,
      scope,
      branch,
      documentType,
    );

    this.logger.verbose(
      `getSynchronizationUnits query: ${JSON.stringify(synchronizationUnitsQuery)}`,
    );

    return this.getSynchronizationUnitsRevision(
      driveId,
      synchronizationUnitsQuery,
    );
  }

  async getSynchronizationUnitsRevision(
    driveId: string,
    syncUnitsQuery: SynchronizationUnitQuery[],
  ): Promise<SynchronizationUnit[]> {
    const drive = await this.getDrive(driveId);

    const revisions =
      await this.storage.getSynchronizationUnitsRevision(syncUnitsQuery);

    this.logger.verbose(
      `getSynchronizationUnitsRevision: ${JSON.stringify(revisions)}`,
    );

    const synchronizationUnits: SynchronizationUnit[] = syncUnitsQuery.map(
      (s) => ({
        ...s,
        lastUpdated: drive.header.createdAtUtcIso,
        revision: -1,
      }),
    );

    for (const revision of revisions) {
      const syncUnit = synchronizationUnits.find(
        (s) =>
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

  async getSynchronizationUnitsIds(
    driveId: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
  ): Promise<SynchronizationUnitQuery[]> {
    const drive = await this.getDrive(driveId);
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
        id: driveId,
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

  async getSynchronizationUnitIdInfo(
    driveId: string,
    syncId: string,
  ): Promise<SynchronizationUnitQuery | undefined> {
    const drive = await this.getDrive(driveId);
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
      documentId: node.id,
      documentType: node.documentType,
    };
  }

  async getSynchronizationUnit(
    driveId: string,
    syncId: string,
  ): Promise<SynchronizationUnit | undefined> {
    const syncUnit = await this.getSynchronizationUnitIdInfo(driveId, syncId);

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
      documentId,
      documentType,
      lastUpdated:
        lastOperation.timestamp ?? document.header.lastModifiedAtUtcIso,
      revision: lastOperation.index ?? 0,
    };
  }

  async getOperationData(
    driveId: string,
    syncId: string,
    filter: GetStrandsOptions,
  ): Promise<OperationUpdate[]> {
    this.logger.verbose(
      `[SYNC DEBUG] SynchronizationManager.getOperationData called for drive: ${driveId}, syncId: ${syncId}, filter: ${JSON.stringify(filter)}`,
    );

    const syncUnit =
      syncId === "0"
        ? { documentId: "", scope: "global" }
        : await this.getSynchronizationUnitIdInfo(driveId, syncId);

    if (!syncUnit) {
      this.logger.error(
        `SYNC DEBUG] Invalid Sync Id ${syncId} in drive ${driveId}`,
      );
      throw new Error(`Invalid Sync Id ${syncId} in drive ${driveId}`);
    }

    this.logger.verbose(
      `[SYNC DEBUG] Found sync unit: documentId: ${syncUnit.documentId}, scope: ${syncUnit.scope}`,
    );

    const document =
      syncId === "0"
        ? await this.getDrive(driveId)
        : await this.getDocument(driveId, syncUnit.documentId); // TODO replace with getDocumentOperations

    this.logger.verbose(
      `[SYNC DEBUG] Retrieved document ${syncUnit.documentId} with type: ${document.header.documentType}`,
    );

    const operations =
      document.operations[syncUnit.scope as OperationScope] ?? []; // TODO filter by branch also

    this.logger.verbose(
      `[SYNC DEBUG] Found ${operations.length} total operations in scope ${syncUnit.scope}`,
    );

    const filteredOperations = operations.filter(
      (operation) =>
        Object.keys(filter).length === 0 ||
        ((filter.since === undefined ||
          isBefore(filter.since, operation.timestamp)) &&
          (filter.fromRevision === undefined ||
            operation.index > filter.fromRevision)),
    );

    this.logger.verbose(
      `[SYNC DEBUG] Filtered to ${filteredOperations.length} operations based on filter criteria` +
        (filter.fromRevision !== undefined
          ? ` (fromRevision: ${filter.fromRevision})`
          : ""),
    );

    const limitedOperations = filter.limit
      ? filteredOperations.slice(0, filter.limit)
      : filteredOperations;

    this.logger.verbose(
      `[SYNC DEBUG] Returning ${limitedOperations.length} operations after applying limit`,
    );

    if (limitedOperations.length > 0) {
      const firstOp = limitedOperations[0];
      const lastOp = limitedOperations[limitedOperations.length - 1];
      this.logger.verbose(
        `[SYNC DEBUG] First operation: index=${firstOp.index}, type=${firstOp.type}`,
      );
      this.logger.verbose(
        `[SYNC DEBUG] Last operation: index=${lastOp.index}, type=${lastOp.type}`,
      );
    }

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

  private async getDrive(driveId: string): Promise<DocumentDriveDocument> {
    try {
      const cachedDocument = await this.cache.getDrive(driveId);
      if (cachedDocument && isDocumentDrive(cachedDocument)) {
        return cachedDocument;
      }
    } catch (e) {
      this.logger.error("Error getting drive from cache", e);
    }
    const driveStorage =
      await this.documentStorage.get<DocumentDriveDocument>(driveId);
    const result = this._buildDocument(driveStorage);
    if (!isDocumentDrive(result)) {
      throw new Error(`Document with id ${driveId} is not a Document Drive`);
    }
    return result;
  }

  private async getDocument(
    driveId: string,
    documentId: string,
  ): Promise<PHDocument> {
    try {
      const cachedDocument = await this.cache.getDocument(documentId);
      if (cachedDocument) {
        return cachedDocument;
      }
    } catch (e) {
      this.logger.error("Error getting document from cache", e);
    }
    const documentStorage = await this.documentStorage.get(documentId);
    return this._buildDocument(documentStorage);
  }

  private _buildDocument(documentStorage: PHDocument): PHDocument {
    const documentModelModule = this.getDocumentModelModule<PHDocument>(
      documentStorage.header.documentType,
    );

    const operations = garbageCollectDocumentOperations(
      documentStorage.operations,
    );

    return replayDocument(
      documentStorage.initialState,
      operations,
      documentModelModule.reducer,
      undefined,
      documentStorage.header,
      undefined,
      {
        checkHashes: true,
        reuseOperationResultingState: true,
      },
    );
  }

  setDocumentModelModules(modules: DocumentModelModule[]) {
    this.documentModelModules = modules;
  }

  private getDocumentModelModule<TDocument>(documentType: string) {
    const documentModelModule = this.documentModelModules.find(
      (m) => m.documentModel.id === documentType,
    );
    if (!documentModelModule) {
      throw new Error(`Document type ${documentType} not supported`);
    }
    return documentModelModule;
  }

  getCombinedSyncUnitStatus(syncUnitStatus: SyncUnitStatusObject): SyncStatus {
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

    return sortedStatus[0];
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

  updateSyncStatus(
    syncUnitId: string,
    status: Partial<SyncUnitStatusObject> | null,
    error?: Error,
  ): void {
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

      if (previousCombinedStatus !== newCombinedStatus && this.eventEmitter) {
        this.eventEmitter.emit(
          "syncStatus",
          syncUnitId,
          this.getCombinedSyncUnitStatus(newstatus),
          error,
          newstatus,
        );
      }
    }
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
    if (this.eventEmitter) {
      this.eventEmitter.emit(
        "syncStatus",
        syncUnitId,
        this.getCombinedSyncUnitStatus(defaultSyncUnitStatus),
        undefined,
        defaultSyncUnitStatus,
      );
    }
  }

  async initializeDriveSyncStatus(
    driveId: string,
    drive: DocumentDriveDocument,
  ): Promise<void> {
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
}
