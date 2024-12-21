import { ISyncUnitRegistry, SyncUnit } from "./types";
import { DuplicatedSyncUnitIdError, SyncUnitNotFoundError } from "./errors";
import { listensToSyncUnit } from "../utils";
import { OperationScope } from "document-model/document";
import { ObservableMap, Subscribe } from "../../utils/observable-map";

export class SyncUnitRegistry implements ISyncUnitRegistry {
  protected syncUnits = new ObservableMap<SyncUnit["id"], SyncUnit>();
  public on: Subscribe<string, SyncUnit>;

  constructor() {
    this.on = this.syncUnits.on.bind(this);
  }

  async getSyncUnit(syncUnitId: string): Promise<SyncUnit | undefined> {
    const syncUnit = this.syncUnits.get(syncUnitId);
    return Promise.resolve(syncUnit);
  }

  async getAllSyncUnits(): Promise<SyncUnit[]> {
    return Promise.resolve([...this.syncUnits.values()]);
  }

  async addSyncUnit(syncUnit: SyncUnit): Promise<SyncUnit> {
    if (this.syncUnits.has(syncUnit.id)) {
      throw new DuplicatedSyncUnitIdError(syncUnit.id);
    }

    this.syncUnits.set(syncUnit.id, syncUnit);
    return Promise.resolve(syncUnit);
  }

  async removeSyncUnit(syncUnitId: string): Promise<boolean> {
    return Promise.resolve(this.syncUnits.delete(syncUnitId));
  }
  updateSyncUnitRevision(
    syncUnitId: string,
    revision: number,
    lastUpdated: string,
  ): Promise<void> {
    const syncUnit = this.syncUnits.get(syncUnitId);
    if (!syncUnit) {
      throw new SyncUnitNotFoundError(
        `Sync Unit with id "${syncUnitId}" not found`,
      );
    }

    const updatedSyncUnit: SyncUnit = { ...syncUnit, revision, lastUpdated };
    this.syncUnits.set(syncUnitId, updatedSyncUnit);
    return Promise.resolve();
  }

  filterSyncUnits(filter: {
    driveId?: string[];
    documentId?: string[];
    scope?: (OperationScope | "*")[];
    branch?: string[];
    documentType?: string[];
  }): Promise<SyncUnit[]> {
    return Promise.resolve([
      ...this.syncUnits.values().filter((syncUnit) => {
        return listensToSyncUnit(filter, syncUnit);
      }),
    ]);
  }
}
