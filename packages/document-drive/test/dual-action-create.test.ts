import type { IDocumentStorage, IDriveOperationStorage } from "document-drive";
import {
  InMemoryCache,
  MemoryStorage,
  ReactorBuilder,
  baseDocumentModels,
} from "document-drive";
import type { DocumentModelDocument } from "document-model";
import {
  documentModelCreateDocument,
  documentModelDocumentModelModule,
} from "document-model";
import { createPresignedHeader, generateId } from "document-model/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const documentModels = baseDocumentModels;

describe("Dual Action Create", () => {
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

  describe("with feature flag disabled (legacy behavior)", () => {
    it("creates document without CREATE_DOCUMENT and UPGRADE_DOCUMENT operations", async () => {
      const server = new ReactorBuilder(documentModels)
        .withCache(cache)
        .withStorage(storage)
        .withOptions({
          featureFlags: {
            enableDualActionCreate: false,
          },
        })
        .build();

      await server.initialize();

      const documentId = generateId();
      const document = await server.addDocument(
        createDocumentModelWithId(documentId),
      );

      expect(document).toBeDefined();
      expect(document.header.id).toBe(documentId);

      // Legacy behavior: no operations on new document
      const operations = [
        ...document.operations.global,
        ...document.operations.local,
      ];
      expect(operations.length).toBe(0);
    });
  });

  describe("with feature flag enabled (dual action behavior)", () => {
    it("creates unsigned document with CREATE_DOCUMENT and UPGRADE_DOCUMENT operations", async () => {
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
      const document = await server.addDocument(
        createDocumentModelWithId(documentId),
      );

      expect(document).toBeDefined();
      expect(document.header.id).toBe(documentId);

      // New behavior: should have CREATE_DOCUMENT and UPGRADE_DOCUMENT operations in document scope
      const operations = document.operations.document || [];
      expect(operations.length).toBe(2);

      // Check CREATE_DOCUMENT operation
      const createOp = operations[0];
      expect(createOp).toBeDefined();
      expect(createOp.action.type).toBe("CREATE_DOCUMENT");
      expect(createOp.action.input).toMatchObject({
        model: documentModelDocumentModelModule.documentModel.global.id,
        version: "0.0.0",
        documentId,
      });
      expect((createOp.action.input as any).signing).toBeUndefined();

      // Check UPGRADE_DOCUMENT operation
      const upgradeOp = operations[1];
      expect(upgradeOp).toBeDefined();
      expect(upgradeOp.action.type).toBe("UPGRADE_DOCUMENT");
      expect(upgradeOp.action.input).toMatchObject({
        model: documentModelDocumentModelModule.documentModel.global.id,
        fromVersion: "0.0.0",
        toVersion: "0.1.0", // hardcoded for now
        documentId,
      });
      expect((upgradeOp.action.input as any).initialState).toBeDefined();
    });

    it("creates document with custom initial state in UPGRADE_DOCUMENT", async () => {
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
      const customState = {
        ...documentModelDocumentModelModule.utils.createState(),
        global: {
          ...documentModelDocumentModelModule.utils.createState().global,
          name: "Custom Document Name",
        },
      };

      const document = await server.addDocument({
        ...createDocumentModelWithId(documentId),
        state: customState,
      });

      expect(document).toBeDefined();
      expect(document.state.global.name).toBe("Custom Document Name");

      // Check UPGRADE_DOCUMENT contains the custom state in document scope
      const operations = document.operations.document || [];
      const upgradeOp = operations[1];
      expect(upgradeOp.action.type).toBe("UPGRADE_DOCUMENT");

      const initialState = (upgradeOp.action.input as any).initialState;
      expect(initialState).toBeDefined();
      expect(initialState.global.name).toBe("Custom Document Name");
    });

    it("should have hashes on CREATE and UPGRADE operations", async () => {
      const storage = new MemoryStorage();
      const server = new ReactorBuilder(baseDocumentModels)
        .withStorage(storage)
        .withOptions({ featureFlags: { enableDualActionCreate: true } })
        .build();

      await server.initialize();

      const docId = generateId();
      const doc = {
        ...documentModelCreateDocument(),
        header: createPresignedHeader(
          docId,
          documentModelDocumentModelModule.documentModel.global.id,
        ),
      };

      const created = await server.addDocument(doc);

      expect(created.operations.document.length).toBe(2);
      expect(created.operations.document[0].action.type).toBe(
        "CREATE_DOCUMENT",
      );
      expect(created.operations.document[0].hash).toBeDefined();
      expect(created.operations.document[0].hash.length).toBeGreaterThan(0);

      expect(created.operations.document[1].action.type).toBe(
        "UPGRADE_DOCUMENT",
      );
      expect(created.operations.document[1].hash).toBeDefined();
      expect(created.operations.document[1].hash.length).toBeGreaterThan(0);
    });

    it("operations are persisted in storage", async () => {
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
      await server.addDocument(createDocumentModelWithId(documentId));

      // Verify operations were stored by retrieving the document
      const retrieved = await server.getDocument(documentId);
      const storedOperations = retrieved.operations.document || [];
      expect(storedOperations.length).toBe(2);

      // Verify operations are in correct order
      expect(storedOperations[0].action.type).toBe("CREATE_DOCUMENT");
      expect(storedOperations[1].action.type).toBe("UPGRADE_DOCUMENT");
    });

    it("document can be retrieved and has correct operations", async () => {
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
      await server.addDocument(createDocumentModelWithId(documentId));

      // Retrieve the document
      const retrieved = await server.getDocument(documentId);

      expect(retrieved).toBeDefined();
      expect(retrieved.header.id).toBe(documentId);

      const operations = retrieved.operations.document || [];
      expect(operations.length).toBe(2);
      expect(operations[0].action.type).toBe("CREATE_DOCUMENT");
      expect(operations[1].action.type).toBe("UPGRADE_DOCUMENT");
    });
  });
});
