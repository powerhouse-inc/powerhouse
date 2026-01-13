import type { IDocumentStorage, IDriveOperationStorage } from "document-drive";
import {
  DocumentAlreadyExistsError,
  InMemoryCache,
  MemoryStorage,
  ReactorBuilder,
  baseDocumentModels,
  driveCreateDocument,
} from "document-drive";
import type { DocumentModelDocument } from "document-model";
import {
  documentModelCreateDocument,
  documentModelDocumentModelModule,
} from "document-model";
import {
  createPresignedHeader,
  deriveOperationId,
  generateId,
} from "document-model/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const documentModels = baseDocumentModels;

describe("Dual Action Migration Tests", () => {
  let storage: IDriveOperationStorage & IDocumentStorage;
  let cache: InMemoryCache;

  beforeEach(async () => {
    vi.setSystemTime(new Date("2024-01-01"));
    storage = new MemoryStorage();
    cache = new InMemoryCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createDocumentModelWithId(id: string): DocumentModelDocument {
    return {
      ...documentModelCreateDocument(),
      header: createPresignedHeader(
        id,
        documentModelDocumentModelModule.documentModel.global.id,
      ),
    };
  }

  describe("CRITICAL: Cross-reactor document migration", () => {
    it("should retrieve legacy document (no operations) in dual-action reactor without adding operations", async () => {
      // Create server with flag OFF
      const legacyServer = new ReactorBuilder(documentModels)
        .withCache(cache)
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: false,
          },
        })
        .build();

      await legacyServer.initialize();

      const documentId = generateId();
      const created = await legacyServer.addDocument(
        createDocumentModelWithId(documentId),
      );

      // Verify no operations on legacy document
      expect(created.operations.global!.length).toBe(0);
      expect(created.operations.local!.length).toBe(0);

      // Create new server with flag ON, sharing same storage
      const dualActionServer = new ReactorBuilder(documentModels)
        .withCache(new InMemoryCache()) // New cache
        .withStorage(storage) // SAME storage
        .withOptions({
          featureFlags: {
            enableDualActionCreate: true,
          },
        })
        .build();

      await dualActionServer.initialize();

      // Retrieve existing document with new server
      const retrieved = await dualActionServer.getDocument(documentId);

      // CRITICAL: Should NOT add CREATE/UPGRADE operations retroactively
      expect(retrieved.operations.global!.length).toBe(0);
      expect(retrieved.operations.local!.length).toBe(0);
      expect(retrieved.state).toEqual(created.state);
    });

    it("should prevent duplicate creation when document already exists in storage", async () => {
      // Create document with flag OFF
      const legacyServer = new ReactorBuilder(documentModels)
        .withCache(cache)
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: false,
          },
        })
        .build();

      await legacyServer.initialize();

      const documentId = generateId();
      await legacyServer.addDocument(createDocumentModelWithId(documentId));

      // Try to create same document with flag ON
      const dualActionServer = new ReactorBuilder(documentModels)
        .withCache(new InMemoryCache())
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: true,
          },
        })
        .build();

      await dualActionServer.initialize();

      // Should throw error BEFORE creating operations
      await expect(
        dualActionServer.addDocument(createDocumentModelWithId(documentId)),
      ).rejects.toThrow(DocumentAlreadyExistsError);

      // Verify no operations were added
      const retrieved = await storage.get(documentId);
      expect(retrieved.operations.global!.length).toBe(0);
    });

    it("should handle dual-action document in legacy reactor", async () => {
      // Create document with flag ON
      const dualActionServer = new ReactorBuilder(documentModels)
        .withCache(cache)
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: true,
          },
        })
        .build();

      await dualActionServer.initialize();

      const documentId = generateId();
      const created = await dualActionServer.addDocument(
        createDocumentModelWithId(documentId),
      );

      // Verify operations exist
      expect(created.operations.document!.length).toBe(2);
      expect(created.operations.document![0].action.type).toBe(
        "CREATE_DOCUMENT",
      );
      expect(created.operations.document![1].action.type).toBe(
        "UPGRADE_DOCUMENT",
      );

      // Retrieve with legacy server
      const legacyServer = new ReactorBuilder(documentModels)
        .withCache(new InMemoryCache())
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: false,
          },
        })
        .build();

      await legacyServer.initialize();

      // Should retrieve successfully
      const retrieved = await legacyServer.getDocument(documentId);

      expect(retrieved).toBeDefined();
      // Operations should be preserved in storage (in document scope)
      expect(retrieved.operations.document!.length).toBe(2);
      // State should match
      expect(retrieved.state).toEqual(created.state);
    });

    it("should not add operations when passing document object with existing operations", async () => {
      // Create a document object that already has operations (e.g., from another source)
      const documentId = generateId();
      const document = createDocumentModelWithId(documentId);

      // Manually add an operation to simulate a document from external source
      const actionId = "action-1";
      document.operations.global!.push({
        id: deriveOperationId(
          documentId,
          "global",
          document.header.branch,
          actionId,
        ),
        index: 0,
        skip: 0,
        hash: "existing-hash",
        timestampUtcMs: new Date().toISOString(),
        action: {
          id: actionId,
          type: "SOME_OPERATION",
          timestampUtcMs: new Date().toISOString(),
          input: {},
          scope: "global",
        },
      });

      const server = new ReactorBuilder(documentModels)
        .withCache(cache)
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: true,
          },
        })
        .build();

      await server.initialize();

      // Pass document with existing operations
      const created = await server.addDocument(document);

      // Should NOT add CREATE/UPGRADE operations since existingOperations.length > 0
      expect(created.operations.global!.length).toBe(1);
      expect(created.operations.global![0].action.type).toBe("SOME_OPERATION");
    });

    it("should handle document migration across multiple reactor restarts", async () => {
      const documentId = generateId();

      // Step 1: Create with legacy reactor
      const server1 = new ReactorBuilder(documentModels)
        .withCache(new InMemoryCache())
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: false,
          },
        })
        .build();

      await server1.initialize();
      await server1.addDocument(createDocumentModelWithId(documentId));

      // Step 2: Retrieve with dual-action reactor
      const server2 = new ReactorBuilder(documentModels)
        .withCache(new InMemoryCache())
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: true,
          },
        })
        .build();

      await server2.initialize();
      const retrieved1 = await server2.getDocument(documentId);
      expect(retrieved1.operations.global!.length).toBe(0);

      // Step 3: Retrieve again with legacy reactor
      const server3 = new ReactorBuilder(documentModels)
        .withCache(new InMemoryCache())
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: false,
          },
        })
        .build();

      await server3.initialize();
      const retrieved2 = await server3.getDocument(documentId);
      expect(retrieved2.operations.global!.length).toBe(0);

      // All states should be identical
      expect(retrieved1.state).toEqual(retrieved2.state);
    });

    it("should handle drive with mix of legacy and dual-action documents", async () => {
      const driveId = generateId();

      // Create drive with legacy server
      const legacyServer = new ReactorBuilder(documentModels)
        .withCache(new InMemoryCache())
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: false,
          },
        })
        .build();

      await legacyServer.initialize();

      const drive = driveCreateDocument();
      drive.header.id = driveId;
      await legacyServer.addDocument(drive);

      const doc1Id = generateId();
      await legacyServer.addDocument(createDocumentModelWithId(doc1Id));

      // Switch to dual-action server
      const dualActionServer = new ReactorBuilder(documentModels)
        .withCache(new InMemoryCache())
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: true,
          },
        })
        .build();

      await dualActionServer.initialize();

      const doc2Id = generateId();
      await dualActionServer.addDocument(createDocumentModelWithId(doc2Id));

      // Retrieve both documents
      const doc1 = await dualActionServer.getDocument(doc1Id);
      const doc2 = await dualActionServer.getDocument(doc2Id);

      // doc1 should have no operations (legacy)
      expect(doc1.operations.global!.length).toBe(0);

      // doc2 should have CREATE + UPGRADE (dual-action) in document scope
      expect(doc2.operations.document!.length).toBe(2);
      expect(doc2.operations.document![0].action.type).toBe("CREATE_DOCUMENT");
      expect(doc2.operations.document![1].action.type).toBe("UPGRADE_DOCUMENT");
    });

    it("should handle document with only partial dual-action operations", async () => {
      // Simulate a corrupted/partial document with only CREATE_DOCUMENT
      const documentId = generateId();
      const document = createDocumentModelWithId(documentId);

      // Add only CREATE_DOCUMENT operation (missing UPGRADE_DOCUMENT)
      const createActionId = generateId();
      document.operations.global!.push({
        id: deriveOperationId(
          documentId,
          "global",
          document.header.branch,
          createActionId,
        ),
        index: 0,
        skip: 0,
        hash: "create-hash",
        timestampUtcMs: new Date().toISOString(),
        action: {
          id: createActionId,
          type: "CREATE_DOCUMENT",
          timestampUtcMs: new Date().toISOString(),
          input: {
            model: documentModelDocumentModelModule.documentModel.global.id,
            version: "0.0.0" as const,
            documentId,
          },
          scope: "global",
        },
      });

      const server = new ReactorBuilder(documentModels)
        .withCache(cache)
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: true,
          },
        })
        .build();

      await server.initialize();

      // This tests edge case: document with partial operations
      const created = await server.addDocument(document);

      // Should not add additional operations since existingOperations.length > 0
      expect(created.operations.global!.length).toBe(1);
      expect(created.operations.global![0].action.type).toBe("CREATE_DOCUMENT");

      // Should be retrievable (even if only partial)
      const retrieved = await server.getDocument(documentId);
      expect(retrieved).toBeDefined();
    });

    it("should not create duplicate operations on document re-import", async () => {
      const server = new ReactorBuilder(documentModels)
        .withCache(cache)
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: true,
          },
        })
        .build();

      await server.initialize();

      const documentId = generateId();
      const doc1 = await server.addDocument(
        createDocumentModelWithId(documentId),
      );

      // Export document
      const exported = { ...doc1 };

      // Try to re-import (should fail with DocumentAlreadyExistsError)
      await expect(server.addDocument(exported)).rejects.toThrow(
        DocumentAlreadyExistsError,
      );

      // Verify no duplicate operations
      const final = await server.getDocument(documentId);
      expect(final.operations.document!.length).toBe(2); // Still just CREATE + UPGRADE
    });
  });

  describe("Document type consistency across reactors", () => {
    it("should handle DocumentDrive migration from legacy to dual-action", async () => {
      const driveId = generateId();

      // Create drive with legacy server
      const legacyServer = new ReactorBuilder(documentModels)
        .withCache(new InMemoryCache())
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: false,
          },
        })
        .build();

      await legacyServer.initialize();

      const drive = driveCreateDocument();
      drive.header.id = driveId;
      const created = await legacyServer.addDocument(drive);

      expect(created.operations.global!.length).toBe(0);

      // Retrieve with dual-action server
      const dualActionServer = new ReactorBuilder(documentModels)
        .withCache(new InMemoryCache())
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: true,
          },
        })
        .build();

      await dualActionServer.initialize();

      const retrieved = await dualActionServer.getDrive(driveId);

      // Should not add operations retroactively
      expect(retrieved.operations.global!.length).toBe(0);
      expect(retrieved.state.global.name).toBe(created.state.global.name);
    });
  });
});
