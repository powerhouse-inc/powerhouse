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

/** The abort check lives in the per-write loop; the batched path must keep it. */
describe("batched applies: the abort signal", () => {
  let store: ReturnType<typeof createMockOperationStore>;
  let applies: Array<{ scope: string; operations: unknown[] }>;

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

  /** Aborts the controller from inside the run, after the third decision read. */
  function build(batchApplies: boolean, controller: AbortController) {
    let documentReads = 0;
    const writeCache: any = {
      getState: vi.fn().mockImplementation((_id: string, scope: string) => {
        if (scope === "document" && ++documentReads === 3) {
          controller.abort();
        }
        return Promise.resolve(document());
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
      {
        batchApplies,
        yieldDeadlineMs: 0,
        featureFlags: { documentDecisions: true },
      },
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

  async function run(batchApplies: boolean) {
    const controller = new AbortController();
    const executor = build(batchApplies, controller);
    const result = await executor.executeJob(
      createTestJob({
        documentId: DOC_ID,
        scope: "global",
        branch: "main",
        actions: actions(10),
      }),
      controller.signal,
    );
    const persisted = applies
      .filter((apply) => apply.scope === "global")
      .reduce((sum, apply) => sum + apply.operations.length, 0);
    return { result, persisted };
  }

  for (const batchApplies of [false, true]) {
    it(`an abort mid-run stops the job (batchApplies: ${batchApplies})`, async () => {
      const { result, persisted } = await run(batchApplies);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Aborted");
      expect(persisted).toBeLessThan(10);
    });
  }
});
