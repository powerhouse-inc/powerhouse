import { addModule, generateId } from "@powerhousedao/shared/document-model";
import { applyDeleteDocumentAction } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteDocumentAction,
  upgradeDocumentAction,
} from "../../../src/actions/index.js";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import { updateDocumentRevision } from "../../../src/executor/util.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import type { KyselyKeyframeStore } from "../../../src/storage/kysely/keyframe-store.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../../src/storage/kysely/types.js";
import {
  createCreateDocumentOperation,
  createTestOperationStore,
} from "../../factories.js";
import { SnapshotPosition } from "../../../src/cache/write-cache-types.js";

const DOC_TYPE = "powerhouse/document-model";
const BRANCH = "main";

/**
 * A stored snapshot must not change once stored, and a read for the head must
 * not be answered by a snapshot of an earlier revision.
 */
describe("write cache snapshot isolation", () => {
  let db: Kysely<DatabaseSchema>;
  let store: KyselyOperationStore;
  let keyframeStore: KyselyKeyframeStore;
  let cache: KyselyWriteCache;
  let cleanup: () => Promise<void>;
  let docId: string;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db;
    store = setup.store;
    keyframeStore = setup.keyframeStore;
    cleanup = setup.cleanup;

    const registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);
    cache = new KyselyWriteCache(keyframeStore, store, registry, {
      maxDocuments: 10,
      ringBufferSize: 30,
      keyframeInterval: 10,
    });
    await cache.startup();

    docId = generateId();
    await store.apply(docId, DOC_TYPE, "document", BRANCH, 0, (txn) => {
      txn.addOperations(createCreateDocumentOperation(docId, DOC_TYPE));
    });
    await store.apply(docId, DOC_TYPE, "document", BRANCH, 1, (txn) => {
      txn.addOperations({
        id: `${docId}-document-1`,
        index: 1,
        timestampUtcMs: "2026-01-01T10:00:00.000Z",
        hash: "spine-1",
        skip: 0,
        action: upgradeDocumentAction({
          documentId: docId,
          model: DOC_TYPE,
          fromVersion: 0,
          toVersion: 1,
          initialState: documentModelDocumentModelModule.utils.createState(),
        }) as never,
      });
    });
  });

  afterEach(async () => {
    await cache.shutdown();
    try {
      await db.destroy();
    } catch {
      // already destroyed
    }
    await cleanup();
  });

  async function appendGlobal(through: number): Promise<void> {
    for (let i = 0; i <= through; i++) {
      await store.apply(docId, DOC_TYPE, "global", BRANCH, i, (txn) => {
        txn.addOperations({
          id: `${docId}-global-${i}`,
          index: i,
          timestampUtcMs: new Date(
            Date.UTC(2026, 0, 1, 11, 0, i),
          ).toISOString(),
          hash: `h${i}`,
          skip: 0,
          action: addModule({ id: `mod-${i}`, name: `m${i}` }) as never,
        });
      });
    }
  }

  function isDeleted(document: { state: unknown }): boolean {
    const scopes = document.state as Record<
      string,
      { isDeleted?: boolean } | undefined
    >;
    return scopes.document?.isDeleted === true;
  }

  function moduleCount(document: { state: unknown }): number {
    const scopes = document.state as Record<
      string,
      { specifications?: { modules?: unknown[] }[] }
    >;
    return (scopes.global.specifications?.[0]?.modules ?? []).length;
  }

  it("keeps a snapshot unchanged when its reader mutates the document", async () => {
    await appendGlobal(2);

    // The second read hits the cache, like a job executor's read does.
    await cache.getState(docId, "document", BRANCH);
    const read = await cache.getState(docId, "document", BRANCH);

    applyDeleteDocumentAction(read, deleteDocumentAction(docId) as never);

    const again = await cache.getState(docId, "document", BRANCH);

    expect(isDeleted(read)).toBe(true);
    expect(isDeleted(again)).toBe(false);
  });

  it("keeps a snapshot unchanged when its writer mutates afterwards", async () => {
    await appendGlobal(2);

    const document = await cache.getState(docId, "document", BRANCH);
    cache.putState(
      docId,
      "document",
      BRANCH,
      1,
      document,
      SnapshotPosition.Head,
    );

    // Writes through the header, the way the executor does after appending.
    updateDocumentRevision(document, "document", 99);

    const stored = await cache.getState(docId, "document", BRANCH, 1);

    expect(stored.header.revision.document).toBe(2);
  });

  it("does not answer a head read from a positional snapshot", async () => {
    await appendGlobal(4);

    await cache.getState(docId, "global", BRANCH, 2);
    const head = await cache.getState(docId, "global", BRANCH);

    expect(head.header.revision.global).toBe(5);
    expect(moduleCount(head)).toBe(5);
  });

  it("builds a head read forward from an earlier snapshot", async () => {
    await appendGlobal(4);
    await cache.getState(docId, "global", BRANCH, 2);

    const reads: number[] = [];
    const getSince = store.getSince.bind(store);
    store.getSince = ((
      id: string,
      scope: string,
      branch: string,
      revision: number,
      ...rest: unknown[]
    ) => {
      if (scope === "global") {
        reads.push(revision);
      }
      return getSince(id, scope, branch, revision, ...(rest as []));
    }) as typeof store.getSince;

    const head = await cache.getState(docId, "global", BRANCH);
    store.getSince = getSince;

    expect(moduleCount(head)).toBe(5);
    // Resumed from the snapshot at 2 rather than replaying from the start.
    expect(reads).toEqual([2]);
  });

  it("still answers a positional read from its own snapshot", async () => {
    await appendGlobal(4);

    const first = await cache.getState(docId, "global", BRANCH, 2);
    const second = await cache.getState(docId, "global", BRANCH, 2);

    expect(moduleCount(first)).toBe(3);
    expect(moduleCount(second)).toBe(3);
    expect(second).not.toBe(first);
  });
});
