import type { Operation } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { Job } from "../../src/queue/types.js";
import {
  createMockCollectionMembershipCache,
  createMockDocumentMetaCache,
  createMockLogger,
  createMockOperationStore,
  createTestEventBus,
  createTestRegistry,
} from "../factories.js";

const DOC_ID = "shuffle-doc";
const DOC_TYPE = "powerhouse/document-model";

function at(seconds: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
}

function storedOp(actionId: string, index: number, seconds: number): Operation {
  return {
    id: `op-${actionId}-${index}`,
    index,
    skip: 0,
    hash: `h-${index}`,
    timestampUtcMs: at(seconds),
    action: {
      id: actionId,
      type: "ADD_MODULE",
      scope: "global",
      timestampUtcMs: at(seconds),
      input: { id: actionId, name: actionId },
    },
  } as Operation;
}

/**
 * A reshuffle hands its whole skip to whichever operation sorts first, and
 * that is ordinary work as often as it is a NOOP. The skip rewinds the stream
 * past what it supersedes, so the state it reduces against is the one standing
 * before those operations -- which the write cache cannot serve, because it
 * stores documents sliced to the last operation per scope. Reducing against
 * the sliced head instead derives the resulting state from the superseded
 * lineage, and that is the state the document view stores and serves.
 */
describe("a write carrying a skip rebuilds from full history", () => {
  let mockOperationStore: ReturnType<typeof createMockOperationStore>;

  function document() {
    return {
      header: {
        protocolVersions: { "base-reducer": 2 },
        id: DOC_ID,
        documentType: DOC_TYPE,
        revision: { document: 1, global: 5 },
      },
      operations: { document: [], global: [], local: [] },
      state: {
        global: {},
        local: {},
        document: { isDeleted: false },
        auth: { version: 0, grants: [] },
      },
    };
  }

  function build() {
    const calls: string[] = [];
    const writeCache: any = {
      getState: vi.fn().mockImplementation((_id, scope) => {
        if (scope === "global") calls.push("getState");
        return Promise.resolve(document());
      }),
      putState: vi.fn(),
      putRun: vi.fn(),
      invalidate: vi.fn().mockImplementation((_id, scope) => {
        if (scope === "global") calls.push("invalidate");
        return 0;
      }),
      clear: vi.fn(),
      startup: vi.fn(),
      shutdown: vi.fn(),
    };
    const operationIndex: any = {
      start: vi.fn().mockReturnValue({
        createCollection: vi.fn(),
        addToCollection: vi.fn(),
        removeFromCollection: vi.fn(),
        recordGroupReferences: vi.fn(),
        write: vi.fn(),
      }),
      commit: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
      getGroupReferencers: vi.fn().mockResolvedValue([]),
    };

    const executor = new SimpleJobExecutor(
      createMockLogger(),
      createTestRegistry([documentModelDocumentModelModule]),
      mockOperationStore,
      createTestEventBus(),
      writeCache,
      operationIndex,
      createMockDocumentMetaCache(),
      createMockCollectionMembershipCache(),
      DEFAULT_DRIVE_CONTAINER_TYPES,
      { maxSkipThreshold: 100 },
    );

    return { executor, calls };
  }

  /** One operation older than everything stored, so it sorts to the front. */
  function loadJob(): Job {
    return {
      kind: "load",
      id: "load-1",
      documentId: DOC_ID,
      scope: "global",
      branch: "main",
      actions: [],
      operations: [storedOp("incoming", 0, 1)],
      createdAt: at(1),
      queueHint: [],
      retryCount: 0,
      maxRetries: 0,
      errorHistory: [],
      meta: { batchId: "b", batchJobIds: ["load-1"] },
    } as unknown as Job;
  }

  beforeEach(() => {
    mockOperationStore = createMockOperationStore();
    const stored = [storedOp("a", 0, 10), storedOp("b", 1, 11)];
    mockOperationStore.getRevisions = vi.fn().mockResolvedValue({
      revision: { global: stored.length },
      latestTimestamp: at(60),
    });
    mockOperationStore.getConflicting = vi.fn().mockResolvedValue({
      results: stored,
      options: {},
      nextCursor: undefined,
    });
    mockOperationStore.getSince = vi.fn().mockResolvedValue({
      results: stored,
      options: {},
      nextCursor: undefined,
    });
  });

  it("invalidates the scope before reading the state it reduces against", async () => {
    const { executor, calls } = build();

    await executor.executeJob(loadJob());

    // The write has to drop the cached stream and then read it back, so the
    // state it reduces against comes from full history rather than from the
    // sliced head. An invalidation with no read after it would leave the
    // reduction on whatever the cache was already holding.
    const firstInvalidate = calls.indexOf("invalidate");
    expect(firstInvalidate).toBeGreaterThanOrEqual(0);
    expect(calls.slice(firstInvalidate)).toContain("getState");
  });
});
