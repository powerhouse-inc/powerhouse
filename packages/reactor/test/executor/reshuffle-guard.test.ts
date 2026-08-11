import type { Operation } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import { ExcessiveReshuffleError } from "../../src/shared/errors.js";
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

function storedOp(
  actionId: string,
  index: number,
  seconds: number,
  extra: Partial<Operation> = {},
): Operation {
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
    ...extra,
  } as Operation;
}

/**
 * The bound catches a genuine divergence between local and incoming history.
 * Counting a pass's re-appends would make the busiest documents
 * revocation-proof.
 */
describe("the excessive reshuffle guard", () => {
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

  function build(maxSkipThreshold: number) {
    const writeCache: any = {
      getState: vi.fn().mockResolvedValue(document()),
      putState: vi.fn(),
      invalidate: vi.fn(),
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

    return new SimpleJobExecutor(
      createMockLogger(),
      createTestRegistry([documentModelDocumentModelModule]),
      mockOperationStore,
      createTestEventBus(),
      writeCache,
      operationIndex,
      createMockDocumentMetaCache(),
      createMockCollectionMembershipCache(),
      DEFAULT_DRIVE_CONTAINER_TYPES,
      { maxSkipThreshold },
    );
  }

  /**
   * One operation timestamped before everything stored. Index 0, because a stored
   * row below the incoming batch's lowest index counts as history, not conflict.
   */
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

  function withStored(conflicting: Operation[], all: Operation[]) {
    mockOperationStore.getRevisions = vi.fn().mockResolvedValue({
      revision: { global: conflicting.length },
      latestTimestamp: at(60),
    });
    mockOperationStore.getConflicting = vi.fn().mockResolvedValue({
      results: conflicting,
      options: {},
      nextCursor: undefined,
    });
    mockOperationStore.getSince = vi.fn().mockResolvedValue({
      results: all,
      options: {},
      nextCursor: undefined,
    });
  }

  beforeEach(() => {
    mockOperationStore = createMockOperationStore();
  });

  it("fails a load that would move more distinct operations than the bound", async () => {
    const stored = [
      storedOp("a", 0, 10),
      storedOp("b", 1, 11),
      storedOp("c", 2, 12),
    ];
    withStored(stored, stored);

    const result = await build(2).executeJob(loadJob());

    expect(result.success).toBe(false);
    expect(ExcessiveReshuffleError.isError(result.error)).toBe(true);
    expect(result.error?.message).toMatch(/Excessive reshuffle detected: 3/);
  });

  it("accepts a load whose bound is not exceeded", async () => {
    const stored = [storedOp("a", 0, 10), storedOp("b", 1, 11)];
    withStored(stored, stored);

    const result = await build(2).executeJob(loadJob());

    expect(ExcessiveReshuffleError.isError(result.error)).toBe(false);
  });

  /** A pass leaves both copies; the replacement is not first-time work. */
  it("does not count a re-appended operation, in the deny direction", async () => {
    // Each action twice: the original and the pass's denied re-append.
    const stored = [
      storedOp("a", 0, 10),
      storedOp("b", 1, 11),
      storedOp("c", 2, 12),
      storedOp("a", 3, 10, { skip: 3, deniedReason: "no grant permits this" }),
      storedOp("b", 4, 11, { deniedReason: "no grant permits this" }),
      storedOp("c", 5, 12, { deniedReason: "no grant permits this" }),
    ];
    withStored(stored, stored);

    const result = await build(2).executeJob(loadJob());

    expect(ExcessiveReshuffleError.isError(result.error)).toBe(false);
  });

  // The grant direction: a pass that re-allows a previously denied tail.
  it("does not count a re-appended operation, in the allow direction", async () => {
    const stored = [
      storedOp("a", 0, 10, { deniedReason: "no grant permits this" }),
      storedOp("b", 1, 11, { deniedReason: "no grant permits this" }),
      storedOp("c", 2, 12, { deniedReason: "no grant permits this" }),
      storedOp("a", 3, 10, { skip: 3 }),
      storedOp("b", 4, 11),
      storedOp("c", 5, 12),
    ];
    withStored(stored, stored);

    const result = await build(2).executeJob(loadJob());

    expect(ExcessiveReshuffleError.isError(result.error)).toBe(false);
  });

  it("still counts operations that are not re-appends beside ones that are", async () => {
    const stored = [
      // One re-appended pair, plus three distinct operations.
      storedOp("a", 0, 10),
      storedOp("a", 1, 10, { skip: 1 }),
      storedOp("x", 2, 11),
      storedOp("y", 3, 12),
      storedOp("z", 4, 13),
    ];
    withStored(stored, stored);

    const result = await build(2).executeJob(loadJob());

    expect(ExcessiveReshuffleError.isError(result.error)).toBe(true);
    // Only the three distinct operations are charged, not the re-appended pair.
    expect(result.error?.message).toMatch(/Excessive reshuffle detected: 3/);
  });
});
