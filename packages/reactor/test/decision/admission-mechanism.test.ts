import { setModelName } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { AppendCondition } from "../../src/storage/interfaces.js";
import {
  createMockCollectionMembershipCache,
  createMockDocumentMetaCache,
  createMockLogger,
  createMockOperationStore,
  createTestEventBus,
  createTestJob,
  createTestRegistry,
} from "../factories.js";

const DOC_ID = "doc-1";
const DOC_TYPE = "powerhouse/document-model";

/**
 * Which mechanism admission uses. The evaluation is the same either way, so the
 * observable difference is the mechanism itself: whether the meta cache is
 * consulted, and whether the write carries a read-set for the store to enforce.
 */
describe("admission mechanism", () => {
  let mockOperationStore: ReturnType<typeof createMockOperationStore>;
  let mockDocumentMetaCache: ReturnType<typeof createMockDocumentMetaCache>;
  let conditions: Array<AppendCondition | undefined>;

  function document() {
    return {
      header: {
        protocolVersions: { "base-reducer": 2 },
        id: DOC_ID,
        documentType: DOC_TYPE,
        revision: { document: 1, global: 0 },
      },
      operations: { document: [], global: [], local: [] },
      state: { global: {}, local: {}, document: { isDeleted: false } },
    };
  }

  function build(featureFlags?: { documentDecisions: boolean }) {
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
        write: vi.fn(),
      }),
      commit: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
    };

    return new SimpleJobExecutor(
      createMockLogger(),
      createTestRegistry([documentModelDocumentModelModule]),
      mockOperationStore,
      createTestEventBus(),
      writeCache,
      operationIndex,
      mockDocumentMetaCache,
      createMockCollectionMembershipCache(),
      DEFAULT_DRIVE_CONTAINER_TYPES,
      featureFlags === undefined ? {} : { featureFlags },
    );
  }

  beforeEach(() => {
    conditions = [];
    mockOperationStore = createMockOperationStore();
    mockOperationStore.apply = vi
      .fn()
      .mockImplementation(
        (
          _documentId: string,
          _documentType: string,
          _scope: string,
          _branch: string,
          _revision: number,
          fn: (txn: unknown) => void,
          _signal?: AbortSignal,
          condition?: AppendCondition,
        ) => {
          conditions.push(condition);
          const staged: unknown[] = [];
          fn({ addOperations: (...ops: unknown[]) => staged.push(...ops) });
          return Promise.resolve(staged);
        },
      );
    mockDocumentMetaCache = createMockDocumentMetaCache();
  });

  async function run(featureFlags?: { documentDecisions: boolean }) {
    const executor = build(featureFlags);
    return executor.executeJob(
      createTestJob({
        documentId: DOC_ID,
        scope: "global",
        branch: "main",
        actions: [setModelName({ name: "n" })],
      }),
    );
  }

  it("reads the meta cache with the flag off, and sends no read-set", async () => {
    await run({ documentDecisions: false });

    expect(mockDocumentMetaCache.getDocumentMeta).toHaveBeenCalled();
    expect(conditions).toEqual([undefined]);
  });

  it("is off unless asked for", async () => {
    await run();

    expect(mockDocumentMetaCache.getDocumentMeta).toHaveBeenCalled();
    expect(conditions).toEqual([undefined]);
  });

  it("skips the meta cache with the flag on, and sends the document stream", async () => {
    await run({ documentDecisions: true });

    expect(mockDocumentMetaCache.getDocumentMeta).not.toHaveBeenCalled();
    expect(conditions).toHaveLength(1);
    expect(conditions[0]?.streams).toEqual([
      { documentId: DOC_ID, scope: "document", branch: "main", revision: 0 },
    ]);
  });
});
