import { type ICache } from "#cache/types";
import { type DocumentDriveDocument } from "#drive-document-model/gen/types";
import {
  type IDocumentStorage,
  type IDriveOperationStorage,
  type IStorageUnit,
} from "#storage/types";
import { childLogger } from "#utils/logger";
import { isBefore, operationsToRevision } from "#utils/misc";
import {
  type DocumentModelModule,
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
      (acc, { documentModelType, ...u }) =>
        u.scope === "local"
          ? acc
          : acc.concat([{ ...u, documentType: documentModelType }]),
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

    const operations = document.operations[scope] ?? [];
    const lastOperation = operations.at(-1);

    return {
      scope,
      branch,
      documentId,
      documentType: document.header.documentType,
      lastUpdated:
        lastOperation?.timestampUtcMs ?? document.header.lastModifiedAtUtcIso,
      revision: operationsToRevision(operations),
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
      `[SYNC DEBUG] Retrieved document ${document.header.id} with type: ${document.header.documentType}`,
    );

    const operations = document.operations[syncId.scope] ?? []; // TODO filter by branch also

    this.logger.verbose(
      `[SYNC DEBUG] Found ${operations.length} total operations in scope ${syncId.scope}`,
    );

    const filteredOperations = operations.filter(
      (operation) =>
        Object.keys(filter).length === 0 ||
        ((filter.since === undefined ||
          isBefore(filter.since, operation.timestampUtcMs)) &&
          (filter.fromRevision === undefined ||
            operation.index >= filter.fromRevision)),
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
        `[SYNC DEBUG] First operation: index=${firstOp.index}, type=${firstOp.action.type}`,
      );
      this.logger.verbose(
        `[SYNC DEBUG] Last operation: index=${lastOp.index}, type=${lastOp.action.type}`,
      );
    }

    return limitedOperations.map((operation) => ({
      actionId: operation.action.id,
      hash: operation.hash,
      index: operation.index,
      timestampUtcMs: operation.timestampUtcMs,
      type: operation.action.type,
      input: operation.action.input as object,
      skip: operation.skip,
      context: operation.action.context,
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
      const newStatus = Object.entries(status).reduce((acc, [key, _status]) => {
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
      const newCombinedStatus = this.getCombinedSyncUnitStatus(newStatus);

      this.syncStatus.set(syncUnitId, newStatus);

      if (previousCombinedStatus !== newCombinedStatus && this.eventEmitter) {
        this.eventEmitter.emit(
          "syncStatus",
          syncUnitId.documentId,
          this.getCombinedSyncUnitStatus(newStatus),
          error,
          newStatus,
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
