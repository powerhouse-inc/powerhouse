import { createNanoEvents } from "nanoevents";
import { describe, it } from "vitest";
import {
  DocumentModelModule,
  generateId,
  OperationScope,
} from "../../document-model/index.js";
import { documentModelDocumentModelModule as DocumentModel } from "../../document-model/src/document-model/module.js";
import InMemoryCache from "../src/cache/memory.js";
import * as DriveActions from "../src/drive-document-model/gen/creators.js";
import { driveDocumentModelModule as DocumentDrive } from "../src/drive-document-model/module.js";
import { SynchronizationUnitNotFoundError } from "../src/server/error.js";
import SynchronizationManager from "../src/server/sync-manager.js";
import { MemoryStorage } from "../src/storage/memory.js";

const documentModels = [DocumentModel, DocumentDrive] as DocumentModelModule[];

describe("Synchronization Manager with memory adapters", () => {
  function initSyncManager() {
    const cache = new InMemoryCache();
    const storage = new MemoryStorage();
    const eventEmitter = createNanoEvents();
    const syncManager = new SynchronizationManager(
      storage,
      storage,
      cache,
      documentModels,
      eventEmitter,
    );
    return { syncManager, cache, storage, eventEmitter };
  }

  it("should get sync unit of drive", async ({ expect }) => {
    const { storage, syncManager } = initSyncManager();
    const drive = DocumentDrive.utils.createDocument();
    await storage.create(drive);

    const syncUnit = await syncManager.getSynchronizationUnit({
      documentId: drive.header.id,
      scope: "global",
      branch: "main",
    });

    expect(syncUnit).toStrictEqual({
      documentId: drive.header.id,
      documentType: "powerhouse/document-drive",
      scope: "global",
      branch: "main",
      lastUpdated: drive.header.lastModifiedAtUtcIso,
      revision: 0,
    });
  });

  it("should get sync unit of document", async ({ expect }) => {
    const { storage, syncManager } = initSyncManager();
    const document = DocumentModel.utils.createDocument();
    await storage.create(document);

    const syncUnit = await syncManager.getSynchronizationUnit({
      documentId: document.header.id,
      scope: "global",
      branch: "main",
    });

    expect(syncUnit).toStrictEqual({
      documentId: document.header.id,
      documentType: "powerhouse/document-model",
      scope: "global",
      branch: "main",
      lastUpdated: document.header.lastModifiedAtUtcIso,
      revision: 0,
    });
  });

  it("should get sync unit revision", async ({ expect }) => {
    const { storage, syncManager } = initSyncManager();

    const drive = DocumentDrive.utils.createDocument();
    await storage.create(drive);

    const newDrive = DocumentDrive.reducer(
      drive,
      DriveActions.addFolder({ id: generateId(), name: "Test" }),
    );
    await storage.addDocumentOperations(
      newDrive.header.id,
      newDrive.operations.global,
      newDrive,
    );
    const syncUnit = await syncManager.getSynchronizationUnit({
      documentId: drive.header.id,
      scope: "global",
      branch: "main",
    });

    expect(syncUnit).toStrictEqual({
      documentId: drive.header.id,
      documentType: "powerhouse/document-drive",
      scope: "global",
      branch: "main",
      lastUpdated: newDrive.header.lastModifiedAtUtcIso,
      revision: 1,
    });
  });

  it("should get sync units of drive and its children", async ({ expect }) => {
    const { storage, syncManager } = initSyncManager();

    const document = DocumentModel.utils.createDocument();
    await storage.create(document);

    let drive = DocumentDrive.utils.createDocument();
    await storage.create(drive);

    drive = DocumentDrive.reducer(
      drive,
      DriveActions.addFile({
        id: document.header.id,
        name: "Document",
        documentType: document.header.documentType,
      }),
    );
    await storage.addDriveOperations(
      drive.header.id,
      drive.operations.global,
      drive,
    );
    await storage.addChild(drive.header.id, document.header.id);

    const syncUnits = await syncManager.getSynchronizationUnits(
      drive.header.id,
    );

    expect(syncUnits).toStrictEqual([
      {
        documentId: drive.header.id,
        documentType: "powerhouse/document-drive",
        scope: "global",
        branch: "main",
        lastUpdated: drive.header.lastModifiedAtUtcIso,
        revision: 1,
      },
      {
        documentId: document.header.id,
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
        lastUpdated: document.header.lastModifiedAtUtcIso,
        revision: 0,
      },
    ]);
  });

  it("should update and get sync status", async ({ expect }) => {
    const { syncManager } = initSyncManager();
    const documentId = "test-doc";
    const scope = "global";
    const branch = "main";

    // Initially no status
    const initialStatus = syncManager.getSyncStatus(documentId);
    expect(initialStatus).toBeInstanceOf(SynchronizationUnitNotFoundError);

    // Update status for the document
    syncManager.updateSyncStatus(documentId, { push: "SUCCESS" });

    // Check the updated status
    const updatedStatus = syncManager.getSyncStatus(documentId);
    expect(updatedStatus).toBe("SUCCESS");

    // Update with multiple statuses - should return the most severe status
    syncManager.updateSyncStatus(documentId, {
      push: "SUCCESS",
      pull: "CONFLICT",
    });
    const multiStatus = syncManager.getSyncStatus(documentId);
    expect(multiStatus).toBe("CONFLICT");

    // Clear the status
    syncManager.updateSyncStatus(documentId, null);
    const clearedStatus = syncManager.getSyncStatus(documentId);
    expect(clearedStatus).toBeInstanceOf(SynchronizationUnitNotFoundError);
  });

  it("should handle sync status with initial sync correctly", async ({
    expect,
  }) => {
    const { syncManager } = initSyncManager();
    const documentId = "test-doc";

    // Set initial sync status
    syncManager.updateSyncStatus(documentId, { pull: "INITIAL_SYNC" });
    expect(syncManager.getSyncStatus(documentId)).toBe("INITIAL_SYNC");

    // Update to SYNCING should maintain INITIAL_SYNC
    syncManager.updateSyncStatus(documentId, { pull: "SYNCING" });
    expect(syncManager.getSyncStatus(documentId)).toBe("INITIAL_SYNC");

    // Update to SUCCESS should change from INITIAL_SYNC
    syncManager.updateSyncStatus(documentId, { pull: "SUCCESS" });
    expect(syncManager.getSyncStatus(documentId)).toBe("SUCCESS");
  });

  it("should get operation data with filters", async ({ expect }) => {
    const { storage, syncManager } = initSyncManager();

    // Create a document with operations
    const document = DocumentModel.utils.createDocument();
    await storage.create(document);

    // Add document state operations using the document model's action creators
    const docOperations = [
      {
        type: "SET_STATE",
        input: { state: { value: 1 } },
        hash: "hash1",
        index: 0,
        timestamp: new Date("2025-01-01").toISOString(),
        id: "op1",
        skip: 0,
        scope: "global" as OperationScope,
        context: undefined,
      },
      {
        type: "SET_STATE",
        input: { state: { value: 2 } },
        hash: "hash2",
        index: 1,
        timestamp: new Date("2025-01-02").toISOString(),
        id: "op2",
        skip: 0,
        scope: "global" as OperationScope,
        context: undefined,
      },
    ];

    // Update document with operations
    await storage.addDocumentOperations(document.header.id, docOperations, {
      ...document,
      header: {
        ...document.header,
        lastModifiedAtUtcIso: new Date("2025-01-02").toISOString(),
      },
    });

    // Get all operations
    const allOps = await syncManager.getOperationData(
      { documentId: document.header.id, scope: "global", branch: "main" },
      {},
    );
    expect(allOps).toHaveLength(2);

    // Get operations after a specific revision
    const laterOps = await syncManager.getOperationData(
      { documentId: document.header.id, scope: "global", branch: "main" },
      { fromRevision: 1 },
    );
    expect(laterOps).toHaveLength(1);
    expect(laterOps[0].index).toBe(1);

    // Get operations with a limit
    const limitedOps = await syncManager.getOperationData(
      { documentId: document.header.id, scope: "global", branch: "main" },
      { limit: 1 },
    );
    expect(limitedOps).toHaveLength(1);
    expect(limitedOps[0].index).toBe(0);
  });

  it("should handle non-existent sync units gracefully", async ({ expect }) => {
    const { storage, syncManager } = initSyncManager();

    // Getting sync unit for non-existent document
    await expect(async () => {
      await syncManager.getSynchronizationUnit({
        documentId: "non-existent",
        scope: "global",
        branch: "main",
      });
    }).rejects.toThrowError("Document with id non-existent not found");

    const document = DocumentModel.utils.createDocument();
    await storage.create(document);

    // Getting sync unit for non-existent document scope should return undefined
    const result = await syncManager.getSynchronizationUnit({
      documentId: document.header.id,
      scope: "non-existent",
      branch: "main",
    });
    expect(result).toBeUndefined();
  });

  it("should filter operation data by timestamp and revision", async ({
    expect,
  }) => {
    const { storage, syncManager } = initSyncManager();

    // Create a document with operations
    const document = DocumentModel.utils.createDocument();
    await storage.create(document);

    // Add document state operations with different timestamps
    const docOperations = [
      {
        type: "SET_STATE",
        input: { state: { value: 1 } },
        hash: "hash1",
        index: 0,
        timestamp: new Date("2025-01-01T10:00:00.000Z").toISOString(),
        id: "op1",
        skip: 0,
        scope: "global" as OperationScope,
        context: undefined,
      },
      {
        type: "SET_STATE",
        input: { state: { value: 2 } },
        hash: "hash2",
        index: 1,
        timestamp: new Date("2025-01-02T10:00:00.000Z").toISOString(),
        id: "op2",
        skip: 0,
        scope: "global" as OperationScope,
        context: undefined,
      },
      {
        type: "SET_STATE",
        input: { state: { value: 3 } },
        hash: "hash3",
        index: 2,
        timestamp: new Date("2025-01-03T10:00:00.000Z").toISOString(),
        id: "op3",
        skip: 0,
        scope: "global" as OperationScope,
        context: undefined,
      },
    ];

    await storage.addDocumentOperations(document.header.id, docOperations, {
      ...document,
      header: {
        ...document.header,
        lastModifiedAtUtcIso: new Date("2025-01-03").toISOString(),
      },
    });

    // Filter by timestamp only
    const sinceOps = await syncManager.getOperationData(
      { documentId: document.header.id, scope: "global", branch: "main" },
      { since: new Date("2025-01-02T00:00:00.000Z").toISOString() },
    );
    expect(sinceOps).toHaveLength(2);
    expect(sinceOps[0].index).toBe(1);
    expect(sinceOps[1].index).toBe(2);

    // Filter by both timestamp and revision
    const combinedOps = await syncManager.getOperationData(
      { documentId: document.header.id, scope: "global", branch: "main" },
      {
        since: new Date("2025-01-02T00:00:00.000Z").toISOString(),
        fromRevision: 2,
      },
    );
    expect(combinedOps).toHaveLength(1);
    expect(combinedOps[0].index).toBe(2);

    // Empty operations when no matches
    const noOps = await syncManager.getOperationData(
      { documentId: document.header.id, scope: "global", branch: "main" },
      { since: new Date("2025-01-04T00:00:00.000Z").toISOString() },
    );
    expect(noOps).toHaveLength(0);
  });

  it("should emit events on sync status changes", async ({ expect }) => {
    const { syncManager, eventEmitter } = initSyncManager();
    const documentId = "test-doc";
    const scope = "global";
    const branch = "main";

    const events: any[] = [];
    const unsubscribe = eventEmitter.on(
      "syncStatus",
      (docId, status, error, statusObj, scope, branch) => {
        events.push({ docId, status, error, statusObj, scope, branch });
      },
    );

    try {
      // Initial status update
      syncManager.updateSyncStatus(documentId, { push: "SUCCESS" });
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        docId: documentId,
        status: "SUCCESS",
        error: undefined,
        statusObj: { push: "SUCCESS" },
        scope: "global",
        branch: "main",
      });

      // Status update with error
      const error = new Error("Sync failed");
      syncManager.updateSyncStatus(documentId, { push: "ERROR" }, error);
      expect(events).toHaveLength(2);
      expect(events[1]).toEqual({
        docId: documentId,
        status: "ERROR",
        error,
        statusObj: { push: "ERROR" },
        scope: "global",
        branch: "main",
      });

      // No event on same status update
      syncManager.updateSyncStatus(documentId, { push: "ERROR" });
      expect(events).toHaveLength(2);

      // Event on status cleared
      syncManager.updateSyncStatus(documentId, null);
      expect(events).toHaveLength(2); // No event for clearing status
    } finally {
      unsubscribe();
    }
  });
});
