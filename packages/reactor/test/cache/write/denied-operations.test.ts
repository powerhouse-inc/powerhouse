import { addModule, generateId } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { upgradeDocumentAction } from "../../../src/actions/index.js";
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
 * A denied operation keeps its index but is never applied, so a rebuild has to
 * skip it. Its action is valid, so nothing else stops the reducer accepting it.
 */
describe("denied operations", () => {
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

  async function appendGlobal(
    index: number,
    deniedReason?: string,
  ): Promise<void> {
    await store.apply(docId, DOC_TYPE, "global", BRANCH, index, (txn) => {
      txn.addOperations({
        id: `${docId}-global-${index}`,
        index,
        timestampUtcMs: new Date(
          Date.UTC(2026, 0, 1, 11, 0, index),
        ).toISOString(),
        hash: `h${index}`,
        skip: 0,
        action: addModule({ id: `mod-${index}`, name: `m${index}` }) as never,
        ...(deniedReason === undefined ? {} : { deniedReason }),
      });
    });
  }

  function moduleIds(document: { state: unknown }): string[] {
    const scopes = document.state as Record<
      string,
      { specifications?: { modules?: { id: string }[] }[] }
    >;
    return (scopes.global.specifications?.[0]?.modules ?? []).map((m) => m.id);
  }

  it("round-trips the reason through the operation store", async () => {
    await appendGlobal(0);
    await appendGlobal(1, "no grant permits this signer");

    const page = await store.getSince(docId, "global", BRANCH, -1);

    expect(page.results.map((op) => op.deniedReason)).toEqual([
      undefined,
      "no grant permits this signer",
    ]);
  });

  it("does not apply a denied operation on a cold rebuild", async () => {
    await appendGlobal(0);
    await appendGlobal(1, "denied");
    await appendGlobal(2);

    const document = await cache.getState(docId, "global", BRANCH);

    expect(moduleIds(document)).toEqual(["mod-0", "mod-2"]);
  });

  it("does not apply a denied operation on a warm rebuild", async () => {
    await appendGlobal(0);
    await cache.getState(docId, "global", BRANCH, 0);

    await appendGlobal(1, "denied");
    await appendGlobal(2);

    const document = await cache.getState(docId, "global", BRANCH, 2);

    expect(moduleIds(document)).toEqual(["mod-0", "mod-2"]);
  });

  it("keeps the denied operation's index", async () => {
    await appendGlobal(0);
    await appendGlobal(1, "denied");
    await appendGlobal(2);

    const document = await cache.getState(docId, "global", BRANCH);

    expect(document.header.revision.global).toBe(3);
    expect(document.operations.global.at(-1)?.index).toBe(2);
  });
});
