import { OperationScope } from "document-model/document";
import { Subscribe } from "../../utils/observable-map";

export type SyncUnit = {
  id: string;
  driveId: string;
  documentId: string;
  documentType: string;
  scope: OperationScope;
  branch: string;
  lastUpdated: string;
  revision: number;
};

export interface ISyncUnitAPI {
  /**
   * Adds a sync unit to track synchronization events.
   * @param syncUnit The sync unit to add.
   * @returns The created sync unit.
   * @throws {IDuplicatedSyncUnitIdError} If a sync unit with the same ID already exists.
   */
  addSyncUnit(syncUnit: SyncUnit): Promise<SyncUnit>;

  /**
   * Removes a sync unit by its ID.
   * @param syncUnitId The ID of the sync unit to remove.
   * @returns A promise that resolves when the sync unit
   * is removed and returns true if it was removed.
   */
  removeSyncUnit(syncUnitId: string): Promise<boolean>;

  /**
   * Retrieves a sync unit by its ID.
   * @param syncUnitId The ID of the sync unit to retrieve.
   * @returns The sync unit if found, or undefined if not found.
   */
  getSyncUnit(syncUnitId: string): Promise<SyncUnit | undefined>;

  /**
   * Retrieves all sync units.
   * @returns An array of all sync units.
   */
  getAllSyncUnits(): Promise<SyncUnit[]>;
}

export interface ISyncUnitRegistry extends ISyncUnitAPI {
  /**
   * Updates a sync unit by its ID.
   * @param syncUnitId The ID of the sync unit to update.
   * @param update The partial updates to apply to the sync unit.
   * @returns A promise that resolves when the sync unit is updated.
   **/
  updateSyncUnitRevision(
    syncUnitId: string,
    revision: number,
    lastUpdated: string,
  ): Promise<void>;

  /**
   * Filters sync units based on provided criteria.
   * @param driveId The Ids of the drives to filter by.
   * @param documentId The ids of the documents to filter by.
   * @param scope The scopes to filter by.
   * @param branch The branches to filter by.
   * @param documentType The document types to filter by.
   * @returns An array of filtered sync units.
   **/
  filterSyncUnits(filter: {
    driveId?: string[];
    documentId?: string[];
    scope?: (OperationScope | "*")[];
    branch?: string[];
    documentType?: string[];
  }): Promise<SyncUnit[]>;

  /**
   * Subscribes to events related to sync units (e.g., add, update, remove).
   */
  on: Subscribe<SyncUnit["id"], SyncUnit>;
}

export interface ISyncUnitStorage {
  /**
   * Adds a new sync unit to storage.
   * @param syncUnit The sync unit to add.
   * @returns A promise that resolves when the sync unit is added.
   */
  addSyncUnit(syncUnit: SyncUnit): Promise<void>;

  /**
   * Updates an existing sync unit in storage.
   * @param syncUnitId The ID of the sync unit to update.
   * @param update The partial updates to apply to the sync unit.
   * @returns A promise that resolves when the sync unit is updated.
   */
  updateSyncUnit(
    syncUnitId: SyncUnit["id"],
    update: Partial<SyncUnit>,
  ): Promise<void>;

  /**
   * Removes a sync unit from storage by its ID.
   * @param syncUnitId The ID of the sync unit to remove.
   * @returns A promise that resolves when the sync unit is removed.
   */
  removeSyncUnit(syncUnitId: SyncUnit["id"]): Promise<void>;

  /**
   * Retrieves all sync units from storage.
   * @returns A promise that resolves with a map of sync unit IDs to sync units.
   */
  getAllSyncUnits(): Promise<Record<SyncUnit["id"], SyncUnit>>;
}
