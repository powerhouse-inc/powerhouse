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
 * How many transactions a job's operations arrive in.
 *
 * The reactor-level test next to this one proves the two paths leave the same
 * operation stream. It cannot prove batching happened, because it would pass
 * just as well if batching never engaged. This counts the applies, which is the
 * only observation that distinguishes them.
 */
describe("batched applies: transaction count", () => {
  let store: ReturnType<typeof createMockOperationStore>;
  let applies: Array<{
    scope: string;
    operations: unknown[];
    revision: number;
  }>;

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
    const writeCache: any = {
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

  beforeEach(() => {
    applies = [];
    store = createMockOperationStore();
    store.apply = vi
      .fn()
      .mockImplementation(
        (
          _documentId: string,
          _documentType: string,
          scope: string,
          _branch: string,
          revision: number,
          fn: (txn: unknown) => void,
        ) => {
          const staged: unknown[] = [];
          fn({ addOperations: (...ops: unknown[]) => staged.push(...ops) });
          applies.push({ scope, operations: staged, revision });
          return Promise.resolve(staged);
        },
      );
  });

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
    const result = await executor.executeJob(
      createTestJob({
        documentId: DOC_ID,
        scope: "global",
        branch: "main",
        actions: actions(count),
      }),
    );
    return result;
  }

  it("writes one transaction per operation when off", async () => {
    const result = await run(false, 10);
    expect(result.error).toBeUndefined();
    const global = applies.filter((a) => a.scope === "global");
    expect(global).toHaveLength(10);
    expect(global.every((a) => a.operations.length === 1)).toBe(true);
  });

  it("writes one transaction for the whole run when on", async () => {
    const result = await run(true, 10);
    expect(result.error).toBeUndefined();
    const global = applies.filter((a) => a.scope === "global");
    expect(global).toHaveLength(1);
    expect(global[0].operations).toHaveLength(10);
    expect(global[0].revision).toBe(0);
  });

  it("does not batch a single action", async () => {
    await run(true, 1);
    expect(applies.filter((a) => a.scope === "global")).toHaveLength(1);
  });

  it("scales the saving with the run length", async () => {
    await run(true, 50);
    const global = applies.filter((a) => a.scope === "global");
    expect(global).toHaveLength(1);
    expect(global[0].operations).toHaveLength(50);
  });
});
