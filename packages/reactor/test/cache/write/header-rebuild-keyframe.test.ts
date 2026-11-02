import { generateId, setSlug } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRelationshipAction,
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
const DOCUMENT_OPERATIONS = 24;

/**
 * A header stream never reaches a keyframe interval, and a large drive's
 * document stream takes longer to replay than a job may run, so a header
 * rebuild has to start from the document scope's keyframe.
 */
describe("rebuilding the header scope", () => {
  let db: Kysely<DatabaseSchema>;
  let store: KyselyOperationStore;
  let keyframeStore: KyselyKeyframeStore;
  let registry: DocumentModelRegistry;
  let cleanup: () => Promise<void>;
  let docId: string;

  const newCache = async () => {
    const cache = new KyselyWriteCache(keyframeStore, store, registry, {
      maxDocuments: 10,
      ringBufferSize: 30,
      keyframeInterval: 10,
    });
    await cache.startup();
    return cache;
  };

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db;
    store = setup.store;
    keyframeStore = setup.keyframeStore;
    cleanup = setup.cleanup;
    registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);

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
    for (let index = 2; index <= DOCUMENT_OPERATIONS; index++) {
      await store.apply(docId, DOC_TYPE, "document", BRANCH, index, (txn) => {
        txn.addOperations({
          id: `${docId}-document-${index}`,
          index,
          timestampUtcMs: new Date(
            Date.UTC(2026, 0, 1, 11, 0, index),
          ).toISOString(),
          hash: `h${index}`,
          skip: 0,
          action: addRelationshipAction(
            docId,
            `child-${index}`,
            "child",
          ) as never,
        });
      });
    }
    await store.apply(docId, DOC_TYPE, "header", BRANCH, 0, (txn) => {
      txn.addOperations({
        id: `${docId}-header-0`,
        index: 0,
        timestampUtcMs: "2026-01-01T12:00:00.000Z",
        hash: "header-0",
        skip: 0,
        action: setSlug("mail") as never,
      });
    });
  });

  afterEach(async () => {
    try {
      await db.destroy();
    } catch {
      // already destroyed
    }
    await cleanup();
  });

  it("starts from a document keyframe and applies the header operations on it", async () => {
    const warm = await newCache();
    const atHead = await warm.getState(docId, "document", BRANCH);
    await keyframeStore.putKeyframe(
      docId,
      "document",
      BRANCH,
      DOCUMENT_OPERATIONS,
      atHead,
    );
    await warm.shutdown();

    const cold = await newCache();
    const read = vi.spyOn(store, "getSince");
    const document = await cold.getState(docId, "header", BRANCH);
    await cold.shutdown();

    expect(document.header.slug).toBe("mail");
    const documentReads = read.mock.calls
      .filter(([, scope]) => scope === "document")
      .map(([, , , revision]) => revision);
    expect(documentReads).not.toContain(-1);
    expect(Math.min(...documentReads)).toBeGreaterThan(0);
  });

  it("replays the document stream when there is no keyframe at all", async () => {
    const cold = await newCache();

    const document = await cold.getState(docId, "header", BRANCH);
    await cold.shutdown();

    expect(document.header.slug).toBe("mail");
  });
});
