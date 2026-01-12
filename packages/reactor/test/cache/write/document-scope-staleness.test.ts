import type { Action, Operation } from "document-model";
import {
  deriveOperationId,
  documentModelDocumentModelModule,
  generateId,
} from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IDocumentMetaCache } from "../../../src/cache/document-meta-cache-types.js";
import { DocumentMetaCache } from "../../../src/cache/document-meta-cache.js";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../../src/cache/write-cache-types.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../../src/registry/interfaces.js";
import type {
  IKeyframeStore,
  IOperationStore,
} from "../../../src/storage/interfaces.js";
import type { Database as DatabaseSchema } from "../../../src/storage/kysely/types.js";
import {
  createCreateDocumentOperation,
  createTestOperation,
  createTestOperationStore,
  createUpgradeDocumentOperation,
} from "../../factories.js";

function createDeleteDocumentOperation(
  documentId: string,
  index: number,
  overrides: Partial<Operation> = {},
): Operation {
  const timestamp = overrides.timestampUtcMs || new Date().toISOString();
  const actionId = generateId();
  return {
    id:
      overrides.id ||
      deriveOperationId(documentId, "document", "main", actionId),
    index,
    skip: 0,
    hash: overrides.hash || `hash-delete-${index}`,
    timestampUtcMs: timestamp,
    action: {
      id: actionId,
      type: "DELETE_DOCUMENT",
      scope: "document",
      timestampUtcMs: timestamp,
      input: {
        documentId,
      },
    } as Action,
    resultingState:
      overrides.resultingState ||
      JSON.stringify({ document: { id: documentId, isDeleted: true } }),
    ...overrides,
  };
}

describe("Document Scope Cross-Scope Dependency Issue", () => {
  let cache: KyselyWriteCache;
  let documentMetaCache: IDocumentMetaCache;
  let keyframeStore: IKeyframeStore;
  let operationStore: IOperationStore;
  let registry: IDocumentModelRegistry;
  let config: WriteCacheConfig;
  let db: Kysely<DatabaseSchema>;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;
    db = setup.db;

    registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);

    config = {
      maxDocuments: 10,
      ringBufferSize: 5,
      keyframeInterval: 10,
    };

    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      config,
    );

    documentMetaCache = new DocumentMetaCache(operationStore, {
      maxDocuments: 100,
    });

    await cache.startup();
    await documentMetaCache.startup();
  });

  afterEach(async () => {
    await cache.shutdown();
    await documentMetaCache.shutdown();

    try {
      await db.destroy();
    } catch {
      //
    }
  });

  describe("Scenario 1: Stale document metadata from keyframe", () => {
    it("should demonstrate stale metadata from keyframe vs correct metadata from DocumentMetaCache", async () => {
      const docId = "staleness-test-doc-1";
      const docType = "powerhouse/document-model";

      // Step 1: Create document (CREATE_DOCUMENT in document scope)
      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        0,
        (txn) => {
          txn.addOperations(createCreateDocumentOperation(docId, docType));
        },
      );

      // Step 2: Apply UPGRADE_DOCUMENT (sets version to 1)
      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        1,
        (txn) => {
          txn.addOperations(
            createUpgradeDocumentOperation(docId, 0, 1, {
              document: {
                version: 1,
                hash: { algorithm: "sha256", encoding: "base64" },
              },
              global: {},
              local: {},
            }),
          );
        },
      );

      // Step 3: Apply some global scope operations
      const globalOps: Operation[] = [];
      for (let i = 1; i <= 10; i++) {
        globalOps.push(
          createTestOperation({
            id: `global-op-${i}`,
            index: i,
            skip: 0,
          }),
        );
      }
      await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
        for (const op of globalOps) {
          txn.addOperations(op);
        }
      });

      // Step 4: Store keyframe for global scope at revision 10
      const docAtRev10 = await cache.getState(docId, "global", "main", 10);
      cache.putState(docId, "global", "main", 10, docAtRev10);

      // Verify the document has version 1 at this point
      expect(docAtRev10.state.document.version).toBe(1);

      // Step 5: Apply another UPGRADE_DOCUMENT (sets version to 2)
      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        2,
        (txn) => {
          txn.addOperations(
            createUpgradeDocumentOperation(
              docId,
              1,
              2,
              {
                document: {
                  version: 2,
                  hash: { algorithm: "sha256", encoding: "base64" },
                },
                global: {},
                local: {},
              },
              { index: 2 },
            ),
          );
        },
      );

      // Step 6: Clear in-memory cache
      cache.clear();

      // Step 7: Call getState(docId, "global", branch) - will load from keyframe
      const docFromKeyframe = await cache.getState(docId, "global", "main", 10);

      // DEMONSTRATES THE BUG: getState returns stale version 1 from keyframe
      expect(docFromKeyframe.state.document.version).toBe(1);

      // Step 8: THE SOLUTION - Use DocumentMetaCache to get correct metadata
      const correctMeta = await documentMetaCache.getDocumentMeta(
        docId,
        "main",
      );

      // DocumentMetaCache returns the correct, current version 2
      expect(correctMeta.state.version).toBe(2);
    });
  });

  describe("Scenario 2: Stale isDeleted flag from cached snapshot", () => {
    it("should demonstrate stale isDeleted from cached snapshot vs correct from DocumentMetaCache", async () => {
      const docId = "staleness-test-doc-2";
      const docType = "powerhouse/document-model";

      // Step 1: Create document + UPGRADE_DOCUMENT
      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        0,
        (txn) => {
          txn.addOperations(createCreateDocumentOperation(docId, docType));
        },
      );

      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        1,
        (txn) => {
          txn.addOperations(
            createUpgradeDocumentOperation(docId, 0, 1, {
              document: {
                version: 1,
                hash: { algorithm: "sha256", encoding: "base64" },
              },
              global: {},
              local: {},
            }),
          );
        },
      );

      // Step 2: Apply global scope operation, cache result with putState
      await operationStore.apply(docId, docType, "global", "main", 0, (txn) => {
        txn.addOperations(
          createTestOperation({
            id: "global-op-1",
            index: 1,
            skip: 0,
          }),
        );
      });

      // Get the document state and explicitly cache it
      const docBeforeDelete = await cache.getState(docId, "global", "main");
      cache.putState(docId, "global", "main", 1, docBeforeDelete);

      // Verify document is not deleted at this point
      expect(docBeforeDelete.state.document.isDeleted).toBeFalsy();

      // Step 3: Apply DELETE_DOCUMENT in document scope
      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        2,
        (txn) => {
          txn.addOperations(createDeleteDocumentOperation(docId, 2));
        },
      );

      // Step 4: Call getState(docId, "global", branch) - cache hit
      const docFromCache = await cache.getState(docId, "global", "main", 1);

      // DEMONSTRATES THE BUG: getState returns stale isDeleted (undefined/false)
      expect(docFromCache.state.document.isDeleted).toBeFalsy();

      // Step 5: THE SOLUTION - Use DocumentMetaCache to get correct metadata
      const correctMeta = await documentMetaCache.getDocumentMeta(
        docId,
        "main",
      );

      // DocumentMetaCache returns the correct isDeleted status
      expect(correctMeta.state.isDeleted).toBe(true);
      expect(correctMeta.state.deletedAtUtcIso).toBeDefined();
    });
  });

  describe("Scenario 3: Revision-specific document state during reshuffle", () => {
    it("should demonstrate rebuildAtRevision for historical document state during reshuffle", async () => {
      const docId = "staleness-test-doc-3";
      const docType = "powerhouse/document-model";

      // Step 1: Create document + UPGRADE_DOCUMENT (version 1)
      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        0,
        (txn) => {
          txn.addOperations(createCreateDocumentOperation(docId, docType));
        },
      );

      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        1,
        (txn) => {
          txn.addOperations(
            createUpgradeDocumentOperation(docId, 0, 1, {
              document: {
                version: 1,
                hash: { algorithm: "sha256", encoding: "base64" },
              },
              global: {},
              local: {},
            }),
          );
        },
      );

      // Step 2: Apply another UPGRADE_DOCUMENT (version 2)
      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        2,
        (txn) => {
          txn.addOperations(
            createUpgradeDocumentOperation(
              docId,
              1,
              2,
              {
                document: {
                  version: 2,
                  hash: { algorithm: "sha256", encoding: "base64" },
                },
                global: {},
                local: {},
              },
              { index: 2 },
            ),
          );
        },
      );

      // Step 3: Apply another UPGRADE_DOCUMENT (version 3)
      await operationStore.apply(
        docId,
        docType,
        "document",
        "main",
        3,
        (txn) => {
          txn.addOperations(
            createUpgradeDocumentOperation(
              docId,
              2,
              3,
              {
                document: {
                  version: 3,
                  hash: { algorithm: "sha256", encoding: "base64" },
                },
                global: {},
                local: {},
              },
              { index: 3 },
            ),
          );
        },
      );

      // getDocumentMeta returns the latest version
      const latestMeta = await documentMetaCache.getDocumentMeta(docId, "main");
      expect(latestMeta.state.version).toBe(3);

      // THE SOLUTION: rebuildAtRevision returns historical state
      // This is needed during reshuffling when operations must be applied
      // at a specific point in history

      // Get state at revision 1 (after first UPGRADE_DOCUMENT)
      const metaAtRev1 = await documentMetaCache.rebuildAtRevision(
        docId,
        "main",
        1,
      );
      expect(metaAtRev1.state.version).toBe(1);

      // Get state at revision 2 (after second UPGRADE_DOCUMENT)
      const metaAtRev2 = await documentMetaCache.rebuildAtRevision(
        docId,
        "main",
        2,
      );
      expect(metaAtRev2.state.version).toBe(2);

      // Get state at revision 0 (after CREATE_DOCUMENT, before any UPGRADE)
      const metaAtRev0 = await documentMetaCache.rebuildAtRevision(
        docId,
        "main",
        0,
      );
      expect(metaAtRev0.state.version).toBe(0);
    });
  });
});
