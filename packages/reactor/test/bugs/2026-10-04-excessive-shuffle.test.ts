import type { Operation } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../src/cache/operation-index-types.js";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { Job } from "../../src/queue/types.js";
import { ExcessiveReshuffleError } from "../../src/shared/errors.js";
import {
  createMockCollectionMembershipCache,
  createMockDocumentMetaCache,
  createMockLogger,
  createMockOperationStore,
  createTestEventBus,
  createTestRegistry,
} from "../factories.js";

const DOC_ID = "osc-doc";
const DOC_TYPE = "powerhouse/document-model";

/** The index-transaction members the load path calls, and nothing else. */
type OperationIndexTxnMock = {
  createCollection: () => void;
  addToCollection: () => void;
  removeFromCollection: () => void;
  recordGroupReferences: () => void;
  getMembershipInvalidations: () => unknown[];
  write: () => void;
};

/** The operation-index members the load path calls, and nothing else. */
type OperationIndexMock = {
  start: () => OperationIndexTxnMock;
  commit: () => Promise<unknown[]>;
  find: () => Promise<{ items: unknown[]; total: number }>;
  getCollectionsForDocuments: () => Promise<Record<string, unknown>>;
  getGroupReferencers: () => Promise<unknown[]>;
};

/** The write-cache members the load path calls, and nothing else. */
type WriteCacheMock = {
  getState: () => Promise<unknown>;
  putState: () => void;
  putRun: () => void;
  invalidate: () => void;
  clear: () => void;
  startup: () => void;
  shutdown: () => void;
};

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

/** A follower history: one append per source, strictly increasing timestamps. */
function followerHistory(tailLength: number): Operation[] {
  const rows: Operation[] = [];
  for (let i = 0; i < tailLength; i++) {
    rows.push(storedOp(`src-${i}`, i, 10 + i));
  }
  return rows;
}

describe("excessive reshuffle on a re-delivered operation", () => {
  let mockOperationStore: ReturnType<typeof createMockOperationStore>;

  function document(globalRevision: number) {
    return {
      header: {
        protocolVersions: { "base-reducer": 2 },
        id: DOC_ID,
        documentType: DOC_TYPE,
        revision: { document: 1, global: globalRevision },
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

  function build(maxSkipThreshold: number, globalRevision: number) {
    const writeCache: WriteCacheMock = {
      getState: vi.fn().mockResolvedValue(document(globalRevision)),
      putState: vi.fn(),
      putRun: vi.fn(),
      invalidate: vi.fn(),
      clear: vi.fn(),
      startup: vi.fn(),
      shutdown: vi.fn(),
    };
    const operationIndex: OperationIndexMock = {
      start: vi.fn().mockReturnValue({
        createCollection: vi.fn(),
        addToCollection: vi.fn(),
        removeFromCollection: vi.fn(),
        recordGroupReferences: vi.fn(),
        getMembershipInvalidations: vi.fn(() => []),
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
      writeCache as unknown as IWriteCache,
      operationIndex as unknown as IOperationIndex,
      createMockDocumentMetaCache(),
      createMockCollectionMembershipCache(),
      DEFAULT_DRIVE_CONTAINER_TYPES,
      { maxSkipThreshold },
    );
  }

  function loadJob(operations: Operation[]): Job {
    return {
      kind: "load",
      id: "load-1",
      documentId: DOC_ID,
      scope: "global",
      branch: "main",
      actions: [],
      operations,
      createdAt: at(1),
      queueHint: [],
      retryCount: 0,
      maxRetries: 0,
      errorHistory: [],
      meta: { batchId: "b", batchJobIds: ["load-1"] },
    } as unknown as Job;
  }

  function withStored(rows: Operation[]) {
    mockOperationStore.getRevisions = vi.fn().mockResolvedValue({
      revision: { global: rows.length },
      latestTimestamp: rows[rows.length - 1]?.timestampUtcMs ?? at(1),
    });
    mockOperationStore.getConflicting = vi
      .fn()
      .mockImplementation((_doc, _scope, _branch, minTimestamp: string) => {
        const floor = Date.parse(minTimestamp);
        return Promise.resolve({
          results: rows.filter(
            (row) => Date.parse(row.timestampUtcMs) >= floor,
          ),
          options: {},
          nextCursor: undefined,
        });
      });
    mockOperationStore.getSince = vi
      .fn()
      .mockImplementation(
        (_doc, _scope, _branch, cursor: number | undefined) => {
          const from = (cursor ?? -1) + 1;
          return Promise.resolve({
            results: rows.filter((row) => row.index >= from),
            options: {},
            nextCursor: undefined,
          });
        },
      );
  }

  beforeEach(() => {
    mockOperationStore = createMockOperationStore();
  });

  it("resolves a re-delivery of held operations to a no-op at field scale", async () => {
    const rows = followerHistory(1612);
    withStored(rows);

    const result = await build(1000, rows.length).executeJob(
      loadJob([rows[7]]),
    );

    expect(ExcessiveReshuffleError.isError(result.error)).toBe(false);
    expect(result.success).toBe(true);
    expect(result.operations).toEqual([]);
  });

  it("does not charge a live tail for a load with nothing to apply", async () => {
    const rows = followerHistory(6);
    withStored(rows);

    const result = await build(2, rows.length).executeJob(loadJob([rows[1]]));

    expect(ExcessiveReshuffleError.isError(result.error)).toBe(false);
    expect(result.success).toBe(true);
    expect(result.operations).toEqual([]);
  });

  it("still refuses a genuine whole-tail reorder", async () => {
    const rows = followerHistory(6);
    withStored(rows);

    const result = await build(2, rows.length).executeJob(
      loadJob([rows[1], storedOp("late-arrival", 2, 12)]),
    );

    expect(ExcessiveReshuffleError.isError(result.error)).toBe(true);
    expect(result.error?.message).toMatch(/Excessive reshuffle detected: 5/);
  });

  /** Current behaviour, not an endorsement: the cost scales with the document. */
  it("charges the whole history for one operation timestamped before it", async () => {
    const rows = followerHistory(6);
    withStored(rows);

    const result = await build(2, rows.length).executeJob(
      loadJob([storedOp("straggler", 0, 1)]),
    );

    expect(ExcessiveReshuffleError.isError(result.error)).toBe(true);
    expect(result.error?.message).toMatch(/Excessive reshuffle detected: 6/);
  });
});
