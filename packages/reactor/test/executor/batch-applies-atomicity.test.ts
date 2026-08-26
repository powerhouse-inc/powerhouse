import {
  setModelName,
  setModelDescription,
} from "@powerhousedao/shared/document-model";
import type { Action } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
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
 * A batched run shares one store transaction, so a store failure must lose all
 * of it. This harness builds the executor without an execution scope, so what
 * it sees is what the batching alone gives; the job-level guarantee that a
 * failed job leaves nothing behind belongs to the execution scope and is pinned
 * in test/executor/integration.test.ts.
 */
describe("batched applies: a store failure loses the whole run", () => {
  let store: ReturnType<typeof createMockOperationStore>;
  let applied: unknown[][];
  let writeCache: any;
  let indexWrites: unknown[][];

  function document() {
    return {
      header: {
        protocolVersions: { "base-reducer": 2 },
        id: DOC_ID,
        documentType: DOC_TYPE,
        revision: { document: 1, global: 0 },
        name: "",
      },
      operations: { document: [], global: [], local: [] },
      state: {
        global: { name: "", description: "" },
        local: {},
        document: { isDeleted: false, version: 1 },
        auth: { version: 0, grants: [] },
      },
    };
  }

  function build(batchApplies: boolean) {
    writeCache = {
      getState: vi.fn().mockImplementation(() => Promise.resolve(document())),
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
        write: vi.fn().mockImplementation((rows: unknown[]) => {
          indexWrites.push(rows);
        }),
      }),
      commit: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
      getGroupReferencers: vi.fn().mockResolvedValue([]),
    };

    return new SimpleJobExecutor(
      createMockLogger(),
      createTestRegistry([documentModelDocumentModelModule]),
      store,
      createTestEventBus(),
      writeCache,
      operationIndex,
      createMockDocumentMetaCache(),
      createMockCollectionMembershipCache(),
      DEFAULT_DRIVE_CONTAINER_TYPES,
      { batchApplies, featureFlags: { documentDecisions: true } },
    );
  }

  /** Applies succeed until the given global-scope call, which rejects. */
  function failStoreAt(failingCall: number) {
    let globalCalls = 0;
    store.apply = vi
      .fn()
      .mockImplementation(
        (
          _documentId: string,
          _documentType: string,
          scope: string,
          _branch: string,
          _revision: number,
          fn: (txn: unknown) => void,
        ) => {
          const staged: unknown[] = [];
          fn({ addOperations: (...ops: unknown[]) => staged.push(...ops) });
          if (scope === "global" && ++globalCalls === failingCall) {
            return Promise.reject(new Error("store lost the transaction"));
          }
          if (scope === "global") {
            applied.push(staged);
          }
          return Promise.resolve(staged);
        },
      );
  }

  function actions(count: number): Action[] {
    const out: Action[] = [];
    for (let i = 0; i < count; i++) {
      out.push(
        i % 2 === 0
          ? setModelName({ name: `n-${i}` })
          : setModelDescription({ description: `d-${i}` }),
      );
    }
    return out;
  }

  async function run(batchApplies: boolean, count: number) {
    const executor = build(batchApplies);
    return executor.executeJob(
      createTestJob({
        documentId: DOC_ID,
        scope: "global",
        branch: "main",
        actions: actions(count),
      }),
    );
  }

  beforeEach(() => {
    applied = [];
    indexWrites = [];
    store = createMockOperationStore();
  });

  it("persists nothing when the batch's one transaction fails", async () => {
    failStoreAt(1);
    const result = await run(true, 10);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("store lost the transaction");
    expect(applied).toHaveLength(0);
    expect(writeCache.putRun).not.toHaveBeenCalled();
    expect(writeCache.putState).not.toHaveBeenCalledWith(
      DOC_ID,
      "global",
      "main",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(indexWrites).toHaveLength(0);
  });

  it("drops the written stream from the cache so a retry rereads it", async () => {
    failStoreAt(1);
    await run(true, 10);

    expect(writeCache.invalidate).toHaveBeenCalledWith(
      DOC_ID,
      "global",
      "main",
    );
  });

  it("keeps the writes before the failure, having no transaction to roll back", async () => {
    // Not the reactor's behaviour: this harness builds the executor without an
    // execution scope, so it runs DefaultExecutionScope, which opens no
    // transaction and applies each write as it is made. Atomicity is the
    // scope's guarantee, and every reactor is built with the Kysely one - see
    // test/executor/integration.test.ts, which pins both scopes side by side.
    failStoreAt(4);
    const result = await run(false, 10);

    expect(result.success).toBe(false);
    expect(applied).toHaveLength(3);
  });
});
