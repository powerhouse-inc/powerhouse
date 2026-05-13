import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndexTxn } from "../../../src/cache/operation-index-types.js";
import { driveCollectionId } from "../../../src/cache/operation-index-types.js";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import { DocumentActionHandler } from "../../../src/executor/document-action-handler.js";
import type { ExecutionStores } from "../../../src/executor/execution-scope.js";
import type { Job } from "../../../src/queue/types.js";
import {
  createMockCollectionMembershipCache,
  createMockDocumentMetaCache,
  createMockLogger,
  createMockOperationStore,
  createTestRegistry,
} from "../../factories.js";

type WriteCacheMock = {
  [K in keyof IWriteCache]: ReturnType<typeof vi.fn>;
};

interface HandlerHarness {
  handler: DocumentActionHandler;
  stores: ExecutionStores;
  writeCache: WriteCacheMock;
  indexTxn: IOperationIndexTxn & {
    createCollection: ReturnType<typeof vi.fn>;
    addToCollection: ReturnType<typeof vi.fn>;
    removeFromCollection: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
  };
  collectionMembershipCache: ReturnType<
    typeof createMockCollectionMembershipCache
  >;
  documentMetaCache: ReturnType<typeof createMockDocumentMetaCache>;
}

function createSourceDoc(
  overrides: { id?: string; documentType?: string } = {},
): PHDocument {
  return {
    header: {
      id: overrides.id ?? "drive-1",
      documentType: overrides.documentType ?? "powerhouse/document-drive",
      revision: { document: 1 },
      lastModifiedAtUtcIso: "2024-01-01T00:00:00.000Z",
    },
    operations: { document: [], global: [], local: [] },
    state: { document: {}, global: {}, local: {} },
  } as unknown as PHDocument;
}

function createHarness(
  sourceDoc: PHDocument = createSourceDoc(),
): HandlerHarness {
  const writeCache: WriteCacheMock = {
    getState: vi.fn().mockResolvedValue(sourceDoc),
    putState: vi.fn(),
    invalidate: vi.fn(),
    clear: vi.fn(),
    startup: vi.fn(),
    shutdown: vi.fn(),
  };
  const indexTxn = {
    createCollection: vi.fn(),
    addToCollection: vi.fn(),
    removeFromCollection: vi.fn(),
    write: vi.fn(),
  };
  const documentMetaCache = createMockDocumentMetaCache();
  const collectionMembershipCache = createMockCollectionMembershipCache();
  const stores: ExecutionStores = {
    operationStore: createMockOperationStore({
      apply: vi.fn().mockResolvedValue(undefined),
    }),
    operationIndex: {} as ExecutionStores["operationIndex"],
    writeCache: writeCache as unknown as IWriteCache,
    documentMetaCache,
    collectionMembershipCache,
  };
  const handler = new DocumentActionHandler(
    createTestRegistry(),
    createMockLogger(),
  );
  return {
    handler,
    stores,
    writeCache,
    indexTxn,
    documentMetaCache,
    collectionMembershipCache,
  };
}

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    kind: "mutation",
    id: "job-1",
    documentId: "drive-1",
    scope: "document",
    branch: "main",
    actions: [],
    operations: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    queueHint: [],
    retryCount: 0,
    maxRetries: 3,
    errorHistory: [],
    meta: { batchId: "batch-1", batchJobIds: ["job-1"] },
    ...overrides,
  } as Job;
}

function buildAction(
  type: "ADD_RELATIONSHIP" | "REMOVE_RELATIONSHIP" | "UPDATE_RELATIONSHIP",
  input: {
    sourceId?: string | null;
    targetId?: string | null;
    relationshipType?: string | null;
    metadata?: unknown;
  },
): Action {
  return {
    id: `action-${type}`,
    type,
    scope: "document",
    timestampUtcMs: "2024-01-01T00:00:00.000Z",
    input,
  } as unknown as Action;
}

describe("DocumentActionHandler", () => {
  describe("executeAddRelationship", () => {
    let harness: HandlerHarness;

    beforeEach(() => {
      harness = createHarness();
    });

    it("persists the operation and adds to the drive collection for a document-drive source", async () => {
      const action = buildAction("ADD_RELATIONSHIP", {
        sourceId: "drive-1",
        targetId: "doc-2",
        relationshipType: "drive/child",
      });
      const job = buildJob({ actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(true);
      expect(harness.stores.operationStore.apply).toHaveBeenCalledTimes(1);
      expect(harness.writeCache.putState).toHaveBeenCalledTimes(1);
      expect(harness.indexTxn.write).toHaveBeenCalledTimes(1);
      expect(harness.indexTxn.addToCollection).toHaveBeenCalledWith(
        driveCollectionId("main", "drive-1"),
        "doc-2",
      );
      expect(harness.collectionMembershipCache.invalidate).toHaveBeenCalledWith(
        "doc-2",
      );
      expect(harness.documentMetaCache.putDocumentMeta).toHaveBeenCalledTimes(
        1,
      );
    });

    it("skips addToCollection when the source is not a document-drive", async () => {
      harness = createHarness(
        createSourceDoc({
          id: "doc-1",
          documentType: "powerhouse/document-model",
        }),
      );
      const action = buildAction("ADD_RELATIONSHIP", {
        sourceId: "doc-1",
        targetId: "doc-2",
        relationshipType: "linked",
      });
      const job = buildJob({ documentId: "doc-1", actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(true);
      expect(harness.indexTxn.addToCollection).not.toHaveBeenCalled();
      expect(
        harness.collectionMembershipCache.invalidate,
      ).not.toHaveBeenCalled();
    });

    it("returns an error result when the job scope is not 'document'", async () => {
      const action = buildAction("ADD_RELATIONSHIP", {
        sourceId: "drive-1",
        targetId: "doc-2",
        relationshipType: "drive/child",
      });
      const job = buildJob({ scope: "global", actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/must be in "document" scope/);
      expect(harness.writeCache.getState).not.toHaveBeenCalled();
    });

    it("returns an error result when required input fields are missing", async () => {
      const action = buildAction("ADD_RELATIONSHIP", {
        sourceId: "drive-1",
        targetId: null,
        relationshipType: "drive/child",
      });
      const job = buildJob({ actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(
        /requires sourceId, targetId, and relationshipType/,
      );
      expect(harness.writeCache.getState).not.toHaveBeenCalled();
    });

    it("returns an error result when sourceId equals targetId (self-relationship)", async () => {
      const action = buildAction("ADD_RELATIONSHIP", {
        sourceId: "same",
        targetId: "same",
        relationshipType: "drive/child",
      });
      const job = buildJob({ documentId: "same", actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/self-relationships not allowed/);
      expect(harness.writeCache.getState).not.toHaveBeenCalled();
    });

    it("returns an error result when the source document cannot be loaded", async () => {
      harness.writeCache.getState.mockRejectedValueOnce(
        new Error("doc missing"),
      );
      const action = buildAction("ADD_RELATIONSHIP", {
        sourceId: "drive-1",
        targetId: "doc-2",
        relationshipType: "drive/child",
      });
      const job = buildJob({ actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(
        /source document drive-1 not found.*doc missing/,
      );
      expect(harness.indexTxn.write).not.toHaveBeenCalled();
    });
  });

  describe("executeRemoveRelationship", () => {
    let harness: HandlerHarness;

    beforeEach(() => {
      harness = createHarness();
    });

    it("persists the operation and removes from the drive collection for a document-drive source", async () => {
      const action = buildAction("REMOVE_RELATIONSHIP", {
        sourceId: "drive-1",
        targetId: "doc-2",
        relationshipType: "drive/child",
      });
      const job = buildJob({ actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(true);
      expect(harness.indexTxn.removeFromCollection).toHaveBeenCalledWith(
        driveCollectionId("main", "drive-1"),
        "doc-2",
      );
      expect(harness.collectionMembershipCache.invalidate).toHaveBeenCalledWith(
        "doc-2",
      );
    });

    it("skips removeFromCollection when the source is not a document-drive", async () => {
      harness = createHarness(
        createSourceDoc({
          id: "doc-1",
          documentType: "powerhouse/document-model",
        }),
      );
      const action = buildAction("REMOVE_RELATIONSHIP", {
        sourceId: "doc-1",
        targetId: "doc-2",
        relationshipType: "linked",
      });
      const job = buildJob({ documentId: "doc-1", actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(true);
      expect(harness.indexTxn.removeFromCollection).not.toHaveBeenCalled();
      expect(
        harness.collectionMembershipCache.invalidate,
      ).not.toHaveBeenCalled();
    });

    it("returns an error result when the job scope is not 'document'", async () => {
      const action = buildAction("REMOVE_RELATIONSHIP", {
        sourceId: "drive-1",
        targetId: "doc-2",
        relationshipType: "drive/child",
      });
      const job = buildJob({ scope: "global", actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/must be in "document" scope/);
    });

    it("returns an error result when required input fields are missing", async () => {
      const action = buildAction("REMOVE_RELATIONSHIP", {
        sourceId: "drive-1",
        targetId: "doc-2",
        relationshipType: null,
      });
      const job = buildJob({ actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(
        /requires sourceId, targetId, and relationshipType/,
      );
    });

    it("returns an error result when the source document cannot be loaded", async () => {
      harness.writeCache.getState.mockRejectedValueOnce(
        new Error("doc missing"),
      );
      const action = buildAction("REMOVE_RELATIONSHIP", {
        sourceId: "drive-1",
        targetId: "doc-2",
        relationshipType: "drive/child",
      });
      const job = buildJob({ actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(
        /source document drive-1 not found.*doc missing/,
      );
    });
  });

  describe("executeUpdateRelationship", () => {
    let harness: HandlerHarness;

    beforeEach(() => {
      harness = createHarness();
    });

    it("persists the operation without touching collection membership", async () => {
      const action = buildAction("UPDATE_RELATIONSHIP", {
        sourceId: "drive-1",
        targetId: "doc-2",
        relationshipType: "drive/child",
        metadata: { parentFolderId: "folder-1" },
      });
      const job = buildJob({ actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(true);
      expect(harness.indexTxn.write).toHaveBeenCalledTimes(1);
      expect(harness.indexTxn.addToCollection).not.toHaveBeenCalled();
      expect(harness.indexTxn.removeFromCollection).not.toHaveBeenCalled();
      expect(
        harness.collectionMembershipCache.invalidate,
      ).not.toHaveBeenCalled();
      expect(harness.documentMetaCache.putDocumentMeta).toHaveBeenCalledTimes(
        1,
      );
    });

    it("returns an error result when the job scope is not 'document'", async () => {
      const action = buildAction("UPDATE_RELATIONSHIP", {
        sourceId: "drive-1",
        targetId: "doc-2",
        relationshipType: "drive/child",
      });
      const job = buildJob({ scope: "global", actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/must be in "document" scope/);
    });

    it("returns an error result when required input fields are missing", async () => {
      const action = buildAction("UPDATE_RELATIONSHIP", {
        sourceId: null,
        targetId: "doc-2",
        relationshipType: "drive/child",
      });
      const job = buildJob({ actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(
        /requires sourceId, targetId, and relationshipType/,
      );
    });

    it("returns an error result when the source document cannot be loaded", async () => {
      harness.writeCache.getState.mockRejectedValueOnce(
        new Error("doc missing"),
      );
      const action = buildAction("UPDATE_RELATIONSHIP", {
        sourceId: "drive-1",
        targetId: "doc-2",
        relationshipType: "drive/child",
      });
      const job = buildJob({ actions: [action] });

      const result = await harness.handler.execute(
        job,
        action,
        Date.now(),
        harness.indexTxn,
        harness.stores,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(
        /source document drive-1 not found.*doc missing/,
      );
    });
  });
});
