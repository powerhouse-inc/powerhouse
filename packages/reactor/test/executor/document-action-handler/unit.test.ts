import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndexTxn } from "../../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import { DocumentActionHandler } from "../../../src/executor/document-action-handler.js";
import { selectDecisionModel } from "../../../src/decision/registered-model.js";
import type { ExecutionStores } from "../../../src/executor/execution-scope.js";
import { targetDocumentId } from "../../../src/executor/util.js";
import type { Job } from "../../../src/queue/types.js";
import type { IDocumentModelRegistry } from "../../../src/registry/interfaces.js";
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
      protocolVersions: { "base-reducer": 2 },
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
    operationStore: createMockOperationStore(),
    operationIndex: {} as ExecutionStores["operationIndex"],
    writeCache: writeCache as unknown as IWriteCache,
    documentMetaCache,
    collectionMembershipCache,
  };
  const flags = { documentDecisions: false, authEnforcement: false };
  const handler = new DocumentActionHandler(
    createTestRegistry(),
    createMockLogger(),
    DEFAULT_DRIVE_CONTAINER_TYPES,
    flags,
    selectDecisionModel(flags),
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

/** Runs one plain local write through the handler's parameter objects. */
function execute(
  harness: {
    handler: DocumentActionHandler;
    stores: ExecutionStores;
    indexTxn: IOperationIndexTxn;
  },
  job: Job,
  action: Action,
) {
  return harness.handler.execute(
    { action, skip: 0, sourceRemote: "" },
    {
      job,
      startTime: Date.now(),
      indexTxn: harness.indexTxn,
      stores: harness.stores,
      replayingAcceptedHistory: false,
      evaluatedByPosition: false,
    },
  );
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

      const result = await execute(harness, job, action);

      expect(result.success).toBe(true);
      expect(harness.stores.operationStore.apply).toHaveBeenCalledTimes(1);
      expect(harness.writeCache.putState).toHaveBeenCalledTimes(1);
      expect(harness.indexTxn.write).toHaveBeenCalledTimes(1);
      expect(harness.indexTxn.addToCollection).toHaveBeenCalledWith(
        DriveCollectionId.forDrive("drive-1").key,
        "doc-2",
      );
      expect(harness.collectionMembershipCache.invalidate).toHaveBeenCalledWith(
        "doc-2",
      );
      expect(harness.documentMetaCache.putDocumentMeta).toHaveBeenCalledTimes(
        1,
      );
    });

    it("also adds to the drive collection for a reactor-drive source", async () => {
      harness = createHarness(
        createSourceDoc({
          id: "drive-rd",
          documentType: "powerhouse/reactor-drive",
        }),
      );
      const action = buildAction("ADD_RELATIONSHIP", {
        sourceId: "drive-rd",
        targetId: "doc-2",
        relationshipType: "drive/child",
      });
      const job = buildJob({ documentId: "drive-rd", actions: [action] });

      const result = await execute(harness, job, action);

      expect(result.success).toBe(true);
      expect(harness.indexTxn.addToCollection).toHaveBeenCalledWith(
        DriveCollectionId.forDrive("drive-rd").key,
        "doc-2",
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

      const result = await execute(harness, job, action);

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

      const result = await execute(harness, job, action);

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

      const result = await execute(harness, job, action);

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

      const result = await execute(harness, job, action);

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

      const result = await execute(harness, job, action);

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

      const result = await execute(harness, job, action);

      expect(result.success).toBe(true);
      expect(harness.indexTxn.removeFromCollection).toHaveBeenCalledWith(
        DriveCollectionId.forDrive("drive-1").key,
        "doc-2",
      );
      expect(harness.collectionMembershipCache.invalidate).toHaveBeenCalledWith(
        "doc-2",
      );
    });

    it("also removes from the drive collection for a reactor-drive source", async () => {
      harness = createHarness(
        createSourceDoc({
          id: "drive-rd",
          documentType: "powerhouse/reactor-drive",
        }),
      );
      const action = buildAction("REMOVE_RELATIONSHIP", {
        sourceId: "drive-rd",
        targetId: "doc-2",
        relationshipType: "drive/child",
      });
      const job = buildJob({ documentId: "drive-rd", actions: [action] });

      const result = await execute(harness, job, action);

      expect(result.success).toBe(true);
      expect(harness.indexTxn.removeFromCollection).toHaveBeenCalledWith(
        DriveCollectionId.forDrive("drive-rd").key,
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

      const result = await execute(harness, job, action);

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

      const result = await execute(harness, job, action);

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

      const result = await execute(harness, job, action);

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

      const result = await execute(harness, job, action);

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

      const result = await execute(harness, job, action);

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

      const result = await execute(harness, job, action);

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

      const result = await execute(harness, job, action);

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

      const result = await execute(harness, job, action);

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(
        /source document drive-1 not found.*doc missing/,
      );
    });
  });

  describe("executeUpgrade", () => {
    const UPGRADE_DOC_ID = "doc-up";

    /** A document whose global scope carries a value a migration can change. */
    function createUpgradableDoc(version: number, counter: number): PHDocument {
      return {
        header: {
          protocolVersions: { "base-reducer": 2 },
          id: UPGRADE_DOC_ID,
          documentType: "powerhouse/document-model",
          revision: { document: 2, global: 3 },
          lastModifiedAtUtcIso: "2024-01-01T00:00:00.000Z",
        },
        operations: { document: [], global: [], local: [] },
        state: { document: { version }, global: { counter }, local: {} },
      } as unknown as PHDocument;
    }

    function counterOf(document: PHDocument): number {
      return (document.state as unknown as { global: { counter: number } })
        .global.counter;
    }

    function upgradingRegistry(
      migration: (document: PHDocument) => PHDocument,
    ): IDocumentModelRegistry {
      return {
        computeUpgradePath: vi
          .fn()
          .mockReturnValue([{ toVersion: 2, upgradeReducer: migration }]),
      } as unknown as IDocumentModelRegistry;
    }

    function upgradeHarness(
      sourceDoc: PHDocument,
      registry: IDocumentModelRegistry,
    ): HandlerHarness {
      const base = createHarness(sourceDoc);
      const flags = { documentDecisions: false, authEnforcement: false };
      return {
        ...base,
        handler: new DocumentActionHandler(
          registry,
          createMockLogger(),
          DEFAULT_DRIVE_CONTAINER_TYPES,
          flags,
          selectDecisionModel(flags),
        ),
      };
    }

    function upgradeAction(
      fromVersion: number,
      toVersion: number,
      revision?: Record<string, number>,
    ): Action {
      return {
        id: "action-upgrade",
        type: "UPGRADE_DOCUMENT",
        scope: "document",
        timestampUtcMs: "2024-01-01T00:00:00.000Z",
        input: {
          documentId: UPGRADE_DOC_ID,
          model: "powerhouse/document-model",
          fromVersion,
          toVersion,
          revision,
        },
      } as unknown as Action;
    }

    function storedRevision(
      result: Awaited<ReturnType<DocumentActionHandler["execute"]>>,
    ): Record<string, number> | undefined {
      const input = result.operations?.[0].action.input as {
        revision?: Record<string, number>;
      };
      return input.revision;
    }

    /**
     * A reshuffle re-appends document-scope operations, so an upgrade can execute
     * a second time against a document that has already reached its target
     * version. The migration must not run against migrated state.
     */
    it("does not re-run the migration when the document already reached the target version", async () => {
      const migration = vi.fn().mockImplementation((document: PHDocument) => {
        const state = document.state as unknown as {
          global: { counter: number };
        };
        state.global = { counter: state.global.counter + 1 };
        return document;
      });

      const action = upgradeAction(1, 2);
      const job = buildJob({ documentId: UPGRADE_DOC_ID, actions: [action] });

      const first = upgradeHarness(
        createUpgradableDoc(1, 0),
        upgradingRegistry(migration),
      );
      const firstResult = await execute(first, job, action);

      expect(firstResult.success).toBe(true);
      expect(migration).toHaveBeenCalledTimes(1);

      const upgraded = first.writeCache.putState.mock.calls[0][4] as PHDocument;
      expect(upgraded.state.document.version).toBe(2);
      expect(counterOf(upgraded)).toBe(1);

      const second = upgradeHarness(upgraded, upgradingRegistry(migration));
      const secondResult = await execute(second, job, action);

      expect(secondResult.success).toBe(true);
      expect(migration).toHaveBeenCalledTimes(1);

      const reapplied = second.writeCache.putState.mock
        .calls[0][4] as PHDocument;
      expect(reapplied.state.document.version).toBe(2);
      expect(counterOf(reapplied)).toBe(1);
    });

    it("persists the store's revisions over a stale client boundary", async () => {
      const harness = upgradeHarness(
        createUpgradableDoc(1, 0),
        upgradingRegistry((document) => document),
      );
      const storeRevisions = { document: 2, global: 7 };
      (
        harness.stores.operationStore.getRevisions as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        revision: storeRevisions,
        latestTimestamp: "2024-01-01T00:00:00.000Z",
      });

      const action = upgradeAction(1, 2, { document: 2, global: 3 });
      const job = buildJob({ documentId: UPGRADE_DOC_ID, actions: [action] });

      const result = await execute(harness, job, action);

      expect(result.success).toBe(true);
      expect(storedRevision(result)).toEqual(storeRevisions);
      expect(
        (
          harness.indexTxn.write.mock.calls[0][0][0] as {
            action: { input: { revision?: Record<string, number> } };
          }
        ).action.input.revision,
      ).toEqual(storeRevisions);
    });

    it("keeps the boundary an operation arrived with when it is replayed", async () => {
      const harness = upgradeHarness(
        createUpgradableDoc(1, 0),
        upgradingRegistry((document) => document),
      );
      (
        harness.stores.operationStore.getRevisions as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        revision: { document: 9, global: 9 },
        latestTimestamp: "2024-01-01T00:00:00.000Z",
      });

      const clientBoundary = { document: 2, global: 3 };
      const action = upgradeAction(1, 2, clientBoundary);
      const job = buildJob({ documentId: UPGRADE_DOC_ID, actions: [action] });

      const result = await harness.handler.execute(
        { action, skip: 0, sourceRemote: "remote-a" },
        {
          job,
          startTime: Date.now(),
          indexTxn: harness.indexTxn,
          stores: harness.stores,
          replayingAcceptedHistory: true,
          evaluatedByPosition: false,
        },
      );

      expect(result.success).toBe(true);
      expect(storedRevision(result)).toEqual(clientBoundary);
    });
  });

  describe("the policy gate follows the action, not the job", () => {
    /**
     * A document-scope action does not have to write to the job's own
     * document: delete and upgrade name the target in `input.documentId`,
     * relationships in `input.sourceId`, and `execute` only checks that a batch
     * shares one scope. Deciding against the job would consult a policy the
     * caller may control instead of the one guarding the write.
     */
    function gatedHarness(sourceDoc: PHDocument) {
      const flags = { documentDecisions: true, authEnforcement: true };
      const harness = createHarness(sourceDoc);
      return {
        ...harness,
        handler: new DocumentActionHandler(
          createTestRegistry(),
          createMockLogger(),
          DEFAULT_DRIVE_CONTAINER_TYPES,
          flags,
          selectDecisionModel(flags),
        ),
      };
    }

    it("decides a relationship against the source document's policy", async () => {
      const harness = gatedHarness(createSourceDoc({ id: "target-doc" }));
      const action = buildAction("ADD_RELATIONSHIP", {
        sourceId: "target-doc",
        targetId: "doc-2",
        relationshipType: "drive/child",
      });
      // The job is keyed by a different document than the action writes to.
      const job = buildJob({ documentId: "attacker-doc", actions: [action] });

      await execute(harness, job, action);

      const gated = harness.writeCache.getState.mock.calls.filter(
        (call) => call[1] === "auth",
      );
      expect(gated.length).toBeGreaterThan(0);
      for (const call of gated) {
        expect(call[0]).toBe("target-doc");
      }
    });

    it("decides a delete against the document named in the input", async () => {
      const harness = gatedHarness(createSourceDoc({ id: "victim-doc" }));
      const action = {
        id: "action-delete",
        type: "DELETE_DOCUMENT",
        scope: "document",
        timestampUtcMs: "2024-01-01T00:00:00.000Z",
        input: { documentId: "victim-doc" },
      } as unknown as Action;
      const job = buildJob({ documentId: "attacker-doc", actions: [action] });

      await execute(harness, job, action);

      const gated = harness.writeCache.getState.mock.calls.filter(
        (call) => call[1] === "auth",
      );
      expect(gated.length).toBeGreaterThan(0);
      for (const call of gated) {
        expect(call[0]).toBe("victim-doc");
      }
    });
  });
});

describe("targetDocumentId", () => {
  const withInput = (type: string, input: unknown) =>
    ({ id: "a", type, scope: "document", input }) as unknown as Action;

  it("reads documentId for delete and upgrade", () => {
    expect(
      targetDocumentId(
        withInput("DELETE_DOCUMENT", { documentId: "doc-b" }),
        "job-doc",
      ),
    ).toBe("doc-b");
    expect(
      targetDocumentId(
        withInput("UPGRADE_DOCUMENT", { documentId: "doc-b" }),
        "job-doc",
      ),
    ).toBe("doc-b");
  });

  it("reads sourceId for the relationship actions", () => {
    for (const type of [
      "ADD_RELATIONSHIP",
      "REMOVE_RELATIONSHIP",
      "UPDATE_RELATIONSHIP",
    ]) {
      expect(
        targetDocumentId(
          withInput(type, { sourceId: "src", documentId: "ignored" }),
          "job-doc",
        ),
      ).toBe("src");
    }
  });

  it("falls back to the job's document when the input names none", () => {
    expect(targetDocumentId(withInput("DELETE_DOCUMENT", {}), "job-doc")).toBe(
      "job-doc",
    );
    expect(
      targetDocumentId(
        withInput("ADD_RELATIONSHIP", { sourceId: "" }),
        "job-doc",
      ),
    ).toBe("job-doc");
    expect(
      targetDocumentId(
        withInput("DELETE_DOCUMENT", { documentId: 42 }),
        "job-doc",
      ),
    ).toBe("job-doc");
  });
});
