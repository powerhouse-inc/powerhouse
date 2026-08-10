import { setGrant } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import type { AuthDecisionModel } from "../../src/decision/auth-decision-model.js";
import type { RegisteredDecisionModel } from "../../src/decision/registered-model.js";
import type {
  DecisionModel,
  DecisionTarget,
} from "../../src/decision/types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { ReactorFeatureFlags } from "../../src/executor/types.js";
import {
  createMockCollectionMembershipCache,
  createMockDocumentMetaCache,
  createMockLogger,
  createMockOperationStore,
  createTestEventBus,
  createTestJob,
  createTestRegistry,
} from "../factories.js";

const DOC_ID = "order-doc";
const DOC_TYPE = "powerhouse/document-model";

/**
 * The revisions map comes from a query with no ORDER BY. A pass reads the auth
 * stream once per scope and the walk skips by stored denial, so an
 * enumeration-dependent order would make two replicas write different history.
 */
describe("re-evaluation scope order", () => {
  let mockOperationStore: ReturnType<typeof createMockOperationStore>;
  let readScopes: string[];

  function document() {
    return {
      header: {
        protocolVersions: { "base-reducer": 2 },
        id: DOC_ID,
        documentType: DOC_TYPE,
        revision: { document: 1, global: 1, auth: 1, custom: 1 },
      },
      operations: { document: [], global: [], local: [], auth: [] },
      state: {
        global: {},
        local: {},
        custom: {},
        document: { isDeleted: false },
        auth: { version: 0, grants: [] },
      },
    };
  }

  function build(featureFlags: Partial<ReactorFeatureFlags>) {
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
      { featureFlags },
    );
  }

  beforeEach(() => {
    readScopes = [];
    mockOperationStore = createMockOperationStore();

    // Shuffled, with a latestTimestamp ahead of the write so the pass is owed.
    mockOperationStore.getRevisions = vi.fn().mockResolvedValue({
      revision: { custom: 1, global: 1, auth: 1, document: 1 },
      latestTimestamp: "2030-01-01T00:00:00.000Z",
    });

    mockOperationStore.getSince = vi
      .fn()
      .mockImplementation(
        (
          _documentId: string,
          scope: string,
          _branch: string,
          _revision: number,
          filter?: { actionTypes?: string[] },
        ) => {
          // The pass's whole-stream reads, not the projection reads.
          if (filter === undefined) {
            readScopes.push(scope);
          }
          return Promise.resolve({
            results: [],
            options: {},
            nextCursor: undefined,
          });
        },
      );

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
        ) => {
          const staged: unknown[] = [];
          fn({ addOperations: (...ops: unknown[]) => staged.push(...ops) });
          return Promise.resolve(staged);
        },
      );
  });

  async function run(
    featureFlags: Partial<ReactorFeatureFlags>,
    executor: SimpleJobExecutor = build(featureFlags),
  ) {
    await executor.executeJob(
      createTestJob({
        documentId: DOC_ID,
        scope: "auth",
        branch: "main",
        actions: [
          setGrant({
            grant: {
              id: "g",
              description: "g",
              effect: "allow",
              principal: { anyone: true },
              capability: { can: "execute", scope: "*" },
            },
          }),
        ],
      }),
    );
  }

  it("visits document, then auth, then the rest sorted", async () => {
    await run({ documentDecisions: true, authEnforcement: true });

    expect(readScopes).toEqual(["document", "auth", "custom", "global"]);
  });

  // The leading scopes come from the model's projections, not a literal.
  it("follows the model's own projection order", async () => {
    function authFirstModel(
      target: DecisionTarget,
    ): DecisionModel<AuthDecisionModel> {
      return {
        projections: {
          auth: {
            decidingActions: [],
            apply: (document) => document,
            query: {
              documentId: target.documentId,
              branch: target.branch,
              scope: "auth",
            },
          },
          document: {
            decidingActions: [],
            apply: (document) => document,
            query: {
              documentId: target.documentId,
              branch: target.branch,
              scope: "document",
            },
          },
        },
        evaluatesScope: () => true,
        decide: () => ({ decision: "allow" }),
      };
    }

    const executor = build({ documentDecisions: true, authEnforcement: true });
    (
      executor as unknown as { decisionModel: RegisteredDecisionModel }
    ).decisionModel = authFirstModel;

    await run({ documentDecisions: true, authEnforcement: true }, executor);

    expect(readScopes).toEqual(["auth", "document", "custom", "global"]);
  });

  // A pass is owed only for a scope the model reads.
  it("owes no pass for a scope outside the read set", async () => {
    await run({ documentDecisions: true, authEnforcement: false });

    expect(readScopes).toEqual([]);
  });
});
