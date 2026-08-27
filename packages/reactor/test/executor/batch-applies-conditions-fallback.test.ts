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

/** A run whose writes read different revisions falls back to per-write applies. */
describe("batched applies: disagreeing conditions abandon the batch", () => {
  let store: ReturnType<typeof createMockOperationStore>;
  let applies: Array<{ scope: string; operations: unknown[] }>;

  function document(documentRevision: number) {
    return {
      header: {
        protocolVersions: { "base-reducer": 2 },
        id: DOC_ID,
        documentType: DOC_TYPE,
        revision: { document: documentRevision, global: 0 },
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

  function build(documentScopeGrows: boolean) {
    // a document-scope revision growing between reads is what conditionsAgree guards
    let documentReads = 0;
    const writeCache: any = {
      getState: vi.fn().mockImplementation((_id: string, scope: string) => {
        const revision =
          scope === "document" && documentScopeGrows ? ++documentReads : 1;
        return Promise.resolve(document(revision));
      }),
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
      store,
      createTestEventBus(),
      writeCache,
      operationIndex,
      createMockDocumentMetaCache(),
      createMockCollectionMembershipCache(),
      DEFAULT_DRIVE_CONTAINER_TYPES,
      { batchApplies: true, featureFlags: { documentDecisions: true } },
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
          _revision: number,
          fn: (txn: unknown) => void,
        ) => {
          const staged: unknown[] = [];
          fn({ addOperations: (...ops: unknown[]) => staged.push(...ops) });
          applies.push({ scope, operations: staged });
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

  async function run(documentScopeGrows: boolean, count: number) {
    const executor = build(documentScopeGrows);
    const result = await executor.executeJob(
      createTestJob({
        documentId: DOC_ID,
        scope: "global",
        branch: "main",
        actions: actions(count),
      }),
    );
    expect(result.error).toBeUndefined();
    return applies.filter((apply) => apply.scope === "global");
  }

  it("replays one apply per write when the read set moved mid-run", async () => {
    const global = await run(true, 10);
    expect(global).toHaveLength(10);
    expect(global.every((apply) => apply.operations.length === 1)).toBe(true);
  });

  it("keeps the single apply when every write read the same revisions", async () => {
    const global = await run(false, 10);
    expect(global).toHaveLength(1);
    expect(global[0].operations).toHaveLength(10);
  });
});
