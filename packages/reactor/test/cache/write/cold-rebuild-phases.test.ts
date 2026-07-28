import { addModule, generateId } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addRelationshipAction,
  deleteDocumentAction,
  upgradeDocumentAction,
} from "../../../src/actions/index.js";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import type { KyselyKeyframeStore } from "../../../src/storage/kysely/keyframe-store.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../../src/storage/kysely/types.js";
import {
  createCreateDocumentOperation,
  createTestOperationStore,
} from "../../factories.js";

const DOC_TYPE = "powerhouse/document-model";
const BRANCH = "main";

/**
 * A cold rebuild applies the document scope first, to settle the document type,
 * upgrades and deletion, then replays the requested scope. These cover the ways
 * the two passes disagreed about which stream to read and how far.
 */
describe("cold rebuild passes", () => {
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

  async function appendRelationship(index: number): Promise<void> {
    await store.apply(docId, DOC_TYPE, "document", BRANCH, index, (txn) => {
      txn.addOperations({
        id: `${docId}-document-${index}`,
        index,
        timestampUtcMs: new Date(
          Date.UTC(2026, 0, 1, 10, 0, index),
        ).toISOString(),
        hash: `rel-${index}`,
        skip: 0,
        action: addRelationshipAction(docId, generateId(), "child") as never,
      });
    });
  }

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

  async function appendDelete(index: number): Promise<void> {
    await store.apply(docId, DOC_TYPE, "document", BRANCH, index, (txn) => {
      txn.addOperations({
        id: `${docId}-document-${index}`,
        index,
        timestampUtcMs: "2026-01-01T12:00:00.000Z",
        hash: `del-${index}`,
        skip: 0,
        action: deleteDocumentAction(docId) as never,
      });
    });
  }

  function isDeleted(document: { state: unknown }): boolean {
    const scopes = document.state as Record<
      string,
      { isDeleted?: boolean } | undefined
    >;
    return scopes.document?.isDeleted === true;
  }

  it("reports the stored head when the document scope is the scope read", async () => {
    await appendRelationship(2);
    await appendRelationship(3);

    const document = await cache.getState(docId, "document", BRANCH);

    expect(document.header.revision.document).toBe(4);
    expect(document.operations.document.at(-1)?.index).toBe(3);
  });

  it("continues stored indices when replaying from a keyframe", async () => {
    await appendGlobal(10);
    await cache.getState(docId, "global", BRANCH);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const keyframes = await keyframeStore.listKeyframes(
      docId,
      "global",
      BRANCH,
    );
    expect(keyframes.map((k) => k.revision)).toEqual([10]);

    await appendGlobal(12);
    cache.invalidate(docId, "global", BRANCH);
    const viaKeyframe = await cache.getState(docId, "global", BRANCH, 12);

    expect(viaKeyframe.header.revision.global).toBe(13);
    expect(viaKeyframe.operations.global.at(-1)?.index).toBe(12);
  });

  it("sees a delete that lands after a keyframe in another scope", async () => {
    await appendGlobal(10);
    await cache.getState(docId, "global", BRANCH);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      (await keyframeStore.listKeyframes(docId, "global", BRANCH)).map(
        (k) => k.revision,
      ),
    ).toEqual([10]);

    await appendDelete(2);
    await appendGlobal(12);

    cache.invalidate(docId, "global", BRANCH);
    const viaKeyframe = await cache.getState(docId, "global", BRANCH, 12);

    await keyframeStore.deleteKeyframes(docId, "global", BRANCH);
    cache.invalidate(docId, "global", BRANCH);
    const fromScratch = await cache.getState(docId, "global", BRANCH, 12);

    expect(isDeleted(fromScratch)).toBe(true);
    expect(isDeleted(viaKeyframe)).toBe(true);
  });

  it("does not apply a delete above a positional target", async () => {
    await appendRelationship(2);
    await appendDelete(3);

    const atTwo = await cache.getState(docId, "document", BRANCH, 2);
    const atHead = await cache.getState(docId, "document", BRANCH);

    expect(isDeleted(atTwo)).toBe(false);
    expect(isDeleted(atHead)).toBe(true);
  });
});
