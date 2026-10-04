import type { Operation } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
 * A pure-follower history of `tailLength` live operations, shaped like the
 * distyra original-source-collection document: one append per source, strictly
 * increasing timestamps, no local edits.
 */
function followerHistory(tailLength: number): Operation[] {
  const rows: Operation[] = [];
  for (let i = 0; i < tailLength; i++) {
    rows.push(storedOp(`src-${i}`, i, 10 + i));
  }
  return rows;
}

/**
 * The reshuffle limiter charges the live tail it would have to re-append, and
 * the charge is taken before the load has established that it has anything to
 * apply. A gap re-pull re-delivering operations the reactor already holds
 * therefore dead-letters as EXCESSIVE_SHUFFLE instead of resolving to the
 * no-op it is. See docs/bugs/2026-10-04-excessive-shuffle-analysis.md.
 */
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
    const writeCache: any = {
      getState: vi.fn().mockResolvedValue(document(globalRevision)),
      putState: vi.fn(),
      putRun: vi.fn(),
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
      writeCache,
      operationIndex,
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

  /**
   * The run-4 field case at its field scale: a 1612-operation follower history
   * and one re-delivered operation the reactor already holds. Nothing is left
   * to apply, so nothing has to move.
   */
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

  /**
   * The same shape at unit scale, with the bound low enough that the charge the
   * limiter would have taken is unmistakable: the whole live tail from the
   * re-delivered operation's index upward.
   */
  it("does not charge a live tail for a load with nothing to apply", async () => {
    const rows = followerHistory(6);
    withStored(rows);

    const result = await build(2, rows.length).executeJob(loadJob([rows[1]]));

    expect(ExcessiveReshuffleError.isError(result.error)).toBe(false);
    expect(result.success).toBe(true);
    expect(result.operations).toEqual([]);
  });

  /**
   * A batch mixing held operations with one genuinely new one still has work to
   * do, and that work still reorders the tail. The limiter is load-bearing
   * here: re-appending the tail materialises one document snapshot and one
   * resulting-state string per moved operation.
   */
  it("still refuses a genuine whole-tail reorder", async () => {
    const rows = followerHistory(6);
    withStored(rows);

    const result = await build(2, rows.length).executeJob(
      loadJob([rows[1], storedOp("late-arrival", 2, 12)]),
    );

    expect(ExcessiveReshuffleError.isError(result.error)).toBe(true);
    expect(result.error?.message).toMatch(/Excessive reshuffle detected: 5/);
  });

  /**
   * The residual design question, asserted as current behaviour rather than
   * fixed: an operation whose timestamp precedes the whole history opens a
   * window over the whole history, and the cost of admitting it scales with the
   * document rather than with the batch.
   */
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
