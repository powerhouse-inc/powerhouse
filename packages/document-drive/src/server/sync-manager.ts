import { type ICache } from "#cache/types";
import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import {
  type IDocumentStorage,
  type IDriveOperationStorage,
  type IStorageUnit,
} from "#storage/types";
import { childLogger } from "#utils/logger";
import { isBefore } from "#utils/misc";
import {
  type DocumentModelModule,
  type OperationScope,
  type PHDocument,
  garbageCollectDocumentOperations,
  replayDocument,
} from "document-model";
import { SynchronizationUnitNotFoundError } from "./error.js";
import { SyncUnitMap } from "./sync-unit-map.js";
import {
  type GetStrandsOptions,
  type IEventEmitter,
  type ISynchronizationManager,
  type OperationUpdate,
  type SyncStatus,
  type SyncUnitStatusObject,
  type SynchronizationUnit,
  type SynchronizationUnitId,
  type SynchronizationUnitQuery,
} from "./types.js";

export default class SynchronizationManager implements ISynchronizationManager {
  private syncStatus = new SyncUnitMap<SyncUnitStatusObject>();

  private logger = childLogger(["SynchronizationManager"]);

  constructor(
    private readonly storage: IDriveOperationStorage,
    private readonly documentStorage: IDocumentStorage,
    private readonly cache: ICache,
    private documentModelModules: DocumentModelModule[],
    private readonly eventEmitter?: IEventEmitter,
  ) {}

  async getSynchronizationUnits(
    parentId: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
  ): Promise<SynchronizationUnit[]> {
    const synchronizationUnitsQuery = await this.getSynchronizationUnitsIds(
      parentId,
      documentId,
      scope,
      branch,
      documentType,
    );

    this.logger.verbose(
      `getSynchronizationUnits query: ${JSON.stringify(synchronizationUnitsQuery)}`,
    );

    const result = await this.getSynchronizationUnitsRevision(
      synchronizationUnitsQuery,
    );
    return result.filter((s) => typeof s !== "undefined");
  }

  private async getSynchronizationUnitsRevision(
    syncUnitsQuery: SynchronizationUnitQuery[],
  ): Promise<(SynchronizationUnit | undefined)[]> {
    const revisions =
      await this.storage.getSynchronizationUnitsRevision(syncUnitsQuery);

    this.logger.verbose(
      `getSynchronizationUnitsRevision: ${JSON.stringify(revisions)}`,
    );

    return syncUnitsQuery.map((query) =>
      revisions.find(
        (revision) =>
          revision.documentId === query.documentId &&
          revision.scope === query.scope &&
          revision.branch === query.branch,
      ),
    );
  }

  async getSynchronizationUnitsIds(
    parentId?: string,
    documentId?: string[],
    scope?: string[],
    branch?: string[],
    documentType?: string[],
  ): Promise<SynchronizationUnitQuery[]> {
    const filter = {
      parentId: parentId ? [parentId] : undefined,
      documentId: documentId,
      documentModelType: documentType,
      scope,
      branch,
    };

    let cursor: string | undefined;
    const units: IStorageUnit[] = [];
    do {
      const { units: newUnits, nextCursor } =
        await this.documentStorage.findStorageUnitsBy(filter, 100, cursor);
      units.push(...newUnits);
      cursor = nextCursor;
    } while (cursor);

    return units.reduce(
      (acc, { documentModelType: _, ...u }) =>
        u.scope === "local" ? acc : acc.concat([u]),
      new Array<SynchronizationUnitQuery>(),
    );
  }

  async getSynchronizationUnit(
    syncId: SynchronizationUnitId,
  ): Promise<SynchronizationUnit | undefined> {
    const { scope, branch, documentId } = syncId;

    // TODO: REPLACE WITH GET DOCUMENT OPERATIONS
    const document = await this.getDocument(documentId);
    if (!Object.keys(document.state).includes(scope)) {
      return undefined;
    }

    const operations = document.operations[scope as OperationScope] ?? [];
    const lastOperation = operations.at(-1);

    return {
      scope,
      branch,
      documentId,
      lastUpdated: lastOperation?.timestamp ?? document.lastModified,
      revision: lastOperation ? lastOperation.index + 1 : 0,
    };
  }

  async getOperationData(
    syncId: SynchronizationUnitId,
    filter: GetStrandsOptions,
  ): Promise<OperationUpdate[]> {
    this.logger.verbose(
      `[SYNC DEBUG] SynchronizationManager.getOperationData called for syncId: ${JSON.stringify(syncId)}, filter: ${JSON.stringify(filter)}`,
    );

    const document = await this.getDocument(syncId.documentId);

    this.logger.verbose(
      `[SYNC DEBUG] Retrieved document ${document.id} with type: ${document.documentType}`,
    );

    const operations =
      document.operations[syncId.scope as OperationScope] ?? []; // TODO filter by branch also

    this.logger.verbose(
      `[SYNC DEBUG] Found ${operations.length} total operations in scope ${syncId.scope}`,
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

  private async getDocument(documentId: string): Promise<PHDocument> {
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
    const documentModelModule = this.getDocumentModelModule(
      documentStorage.documentType,
    );

    const operations = garbageCollectDocumentOperations(
      documentStorage.operations,
    );

    return replayDocument(
      documentStorage.initialState,
      operations,
      documentModelModule.reducer,
      undefined,
      documentStorage,
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

  private getDocumentModelModule(documentType: string) {
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
    input: string | SynchronizationUnitId,
    scope = "global",
    branch = "main",
  ): SyncStatus | SynchronizationUnitNotFoundError {
    const syncUnitId =
      typeof input === "string" ? { documentId: input, scope, branch } : input;

    const status = this.syncStatus.get(syncUnitId);
    if (!status) {
      return new SynchronizationUnitNotFoundError(syncUnitId);
    }
    return this.getCombinedSyncUnitStatus(status);
  }

  updateSyncStatus(
    input: string | SynchronizationUnitId,
    status: Partial<SyncUnitStatusObject> | null,
    error?: Error,
    scope = "global",
    branch = "main",
  ): void {
    const syncUnitId =
      typeof input === "string" ? { documentId: input, scope, branch } : input;

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
          syncUnitId.documentId,
          this.getCombinedSyncUnitStatus(newstatus),
          error,
          newstatus,
          syncUnitId.scope,
          syncUnitId.branch,
        );
      }
    }
  }

  private initSyncStatus(
    syncUnitId: SynchronizationUnitId,
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
        syncUnitId.documentId, // TODO also emit scope and branch
        this.getCombinedSyncUnitStatus(defaultSyncUnitStatus),
        undefined,
        defaultSyncUnitStatus,
        syncUnitId.scope,
        syncUnitId.branch,
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

    const syncUnitsIds = [
      { documentId: driveId, scope: "global", branch: "main" },
      ...syncUnits,
    ];

    for (const syncUnitId of syncUnitsIds) {
      this.initSyncStatus(syncUnitId, syncStatus);
    }
  }
}
