import type {
  Operation,
  PHAuthState,
  PHDocumentState,
} from "@powerhousedao/shared/document-model";
import {
  generateId,
  initializeAuth,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../src/cache/write-cache-types.js";
import { buildDecisionModel } from "../../src/decision/build-decision-model.js";
import type {
  DecisionModel,
  DecisionTarget,
} from "../../src/decision/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import { AppendConditionFailedError } from "../../src/storage/interfaces.js";
import type { KyselyKeyframeStore } from "../../src/storage/kysely/keyframe-store.js";
import type { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../src/storage/kysely/types.js";
import {
  createCreateDocumentOperation,
  createTestOperation,
  createTestOperationStore,
} from "../factories.js";

const DOC_TYPE = "powerhouse/document-model";
const BRANCH = "main";

type AuthDocumentModel = {
  document: PHDocumentState;
  auth: PHAuthState;
};

const definition = (
  target: DecisionTarget,
): DecisionModel<AuthDocumentModel> => ({
  projections: {
    document: {
      query: {
        documentId: target.documentId,
        branch: target.branch,
        scope: "document",
      },
    },
    auth: {
      query: {
        documentId: target.documentId,
        branch: target.branch,
        scope: "auth",
      },
    },
  },
  decide: (model) => (model.document.isDeleted ? "deny" : "allow"),
});

describe("buildDecisionModel + IOperationStore.apply integration", () => {
  let db: Kysely<DatabaseSchema>;
  let operationStore: KyselyOperationStore;
  let keyframeStore: KyselyKeyframeStore;
  let cache: KyselyWriteCache;
  let cleanup: () => Promise<void>;
  let docId: string;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db;
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;
    cleanup = setup.cleanup;

    const registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);

    const config: WriteCacheConfig = {
      maxDocuments: 10,
      ringBufferSize: 5,
      keyframeInterval: 10,
    };
    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      config,
    );
    await cache.startup();

    docId = generateId();
    await operationStore.apply(
      docId,
      DOC_TYPE,
      "document",
      BRANCH,
      0,
      (txn) => {
        txn.addOperations(createCreateDocumentOperation(docId, DOC_TYPE));
      },
    );
    await operationStore.apply(docId, DOC_TYPE, "global", BRANCH, 0, (txn) => {
      txn.addOperations(
        createTestOperation(docId, { index: 0 }),
        createTestOperation(docId, { index: 1 }),
      );
    });
  });

  afterEach(async () => {
    await cache.shutdown();
    try {
      await db.destroy();
    } catch {
      //
    }
    await cleanup();
  });

  function target(): DecisionTarget {
    return { documentId: docId, branch: BRANCH };
  }

  it("records the store's real stream heads in the append condition", async () => {
    const { model, appendCondition } = await buildDecisionModel(
      cache,
      definition,
      target(),
    );

    expect(model.document.isDeleted).toBeFalsy();
    expect(model.auth.version).toBe(0);
    expect(appendCondition.streams).toEqual([
      { documentId: docId, scope: "document", branch: BRANCH, revision: 0 },
      { documentId: docId, scope: "auth", branch: BRANCH, revision: -1 },
    ]);
  });

  it("an apply guarded by the built condition lands while the read-set holds", async () => {
    const { appendCondition } = await buildDecisionModel(
      cache,
      definition,
      target(),
    );

    const stored = await operationStore.apply(
      docId,
      DOC_TYPE,
      "global",
      BRANCH,
      2,
      (txn) => {
        txn.addOperations(createTestOperation(docId, { index: 2 }));
      },
      undefined,
      appendCondition,
    );

    expect(stored).toHaveLength(1);
  });

  it("a stale condition fails after the auth stream grows, and an invalidate-rebuild retry lands", async () => {
    const staleBuild = await buildDecisionModel(cache, definition, target());

    const authAction = initializeAuth({ version: 1, grants: [] });
    const authOperation: Operation = {
      id: generateId(),
      index: 0,
      timestampUtcMs: new Date().toISOString(),
      hash: "auth-hash-0",
      skip: 0,
      action: authAction,
    };
    await operationStore.apply(docId, DOC_TYPE, "auth", BRANCH, 0, (txn) => {
      txn.addOperations(authOperation);
    });

    await expect(
      operationStore.apply(
        docId,
        DOC_TYPE,
        "global",
        BRANCH,
        2,
        (txn) => {
          txn.addOperations(createTestOperation(docId, { index: 2 }));
        },
        undefined,
        staleBuild.appendCondition,
      ),
    ).rejects.toThrow(AppendConditionFailedError);

    const globalOps = await operationStore.getSince(
      docId,
      "global",
      BRANCH,
      -1,
    );
    expect(globalOps.results).toHaveLength(2);

    // the executor's condition-failure handling: every read-set stream in
    // the failed condition leaves the cache, then the model rebuilds
    let error: unknown;
    try {
      await operationStore.apply(
        docId,
        DOC_TYPE,
        "global",
        BRANCH,
        2,
        (txn) => {
          txn.addOperations(createTestOperation(docId, { index: 2 }));
        },
        undefined,
        staleBuild.appendCondition,
      );
    } catch (caught) {
      error = caught;
    }
    expect(AppendConditionFailedError.isError(error)).toBe(true);
    for (const stream of (error as AppendConditionFailedError).condition
      .streams) {
      cache.invalidate(stream.documentId, stream.scope, stream.branch);
    }

    const freshBuild = await buildDecisionModel(cache, definition, target());

    expect(freshBuild.model.auth.version).toBe(1);
    expect(freshBuild.appendCondition.streams).toContainEqual({
      documentId: docId,
      scope: "auth",
      branch: BRANCH,
      revision: 0,
    });

    const stored = await operationStore.apply(
      docId,
      DOC_TYPE,
      "global",
      BRANCH,
      2,
      (txn) => {
        txn.addOperations(createTestOperation(docId, { index: 2 }));
      },
      undefined,
      freshBuild.appendCondition,
    );

    expect(stored).toHaveLength(1);
  });
});
