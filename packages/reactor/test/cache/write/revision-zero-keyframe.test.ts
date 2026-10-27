import type { PHDocument } from "@powerhousedao/shared/document-model";
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

function moduleIds(document: PHDocument): string[] {
  const global = (
    document.state as Record<
      string,
      { specifications?: { modules?: { id: string }[] }[] }
    >
  ).global;
  return (global.specifications?.[0]?.modules ?? []).map((m) => m.id);
}

describe("write cache cold read of revision 0 on base-reducer 2", () => {
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
      txn.addOperations(
        createCreateDocumentOperation(
          docId,
          DOC_TYPE,
          {},
          { protocolVersions: { "base-reducer": 2 } },
        ),
      );
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
    for (let i = 0; i <= 4; i++) {
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

  it("reads revision 0 positionally, not from a later keyframe", async () => {
    const atFour = await cache.getState(docId, "global", BRANCH, 4);
    await keyframeStore.putKeyframe(docId, "global", BRANCH, 4, atFour);
    cache.clear();

    const document = await cache.getState(docId, "global", BRANCH, 0);

    expect(moduleIds(document)).toEqual(["mod-0"]);
  });
});
