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
 * A rebuild takes the protocol version from the stored CREATE_DOCUMENT input,
 * since the header factory does not set one. An input written before the
 * reactor stamped it therefore resolves to 1 for the life of the document.
 */
describe("protocol version on rebuild", () => {
  let db: Kysely<DatabaseSchema>;
  let store: KyselyOperationStore;
  let keyframeStore: KyselyKeyframeStore;
  let cache: KyselyWriteCache;
  let cleanup: () => Promise<void>;

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
      ringBufferSize: 10,
      keyframeInterval: 10,
    });
    await cache.startup();
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

  /**
   * Seeds a create plus one global operation, so the rebuild has to run a
   * reducer and therefore has to resolve a protocol version.
   */
  async function seedAndRebuild(
    operation: ReturnType<typeof createCreateDocumentOperation>,
  ) {
    const docId = (operation.action.input as { documentId: string }).documentId;
    await store.apply(docId, DOC_TYPE, "document", BRANCH, 0, (txn) => {
      txn.addOperations(operation);
    });
    await store.apply(docId, DOC_TYPE, "document", BRANCH, 1, (txn) => {
      txn.addOperations({
        id: `${docId}-document-1`,
        index: 1,
        timestampUtcMs: "2026-01-01T10:00:00.000Z",
        hash: "upgrade-1",
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
    await store.apply(docId, DOC_TYPE, "global", BRANCH, 0, (txn) => {
      txn.addOperations({
        id: `${docId}-global-0`,
        index: 0,
        timestampUtcMs: "2026-01-01T11:00:00.000Z",
        hash: "g0",
        skip: 0,
        action: addModule({ id: "mod-0", name: "m0" }) as never,
      });
    });
    return cache.getState(docId, "global", BRANCH);
  }

  it("carries base-reducer 2 from a create the reactor wrote", async () => {
    const document = await seedAndRebuild(
      createCreateDocumentOperation(generateId(), DOC_TYPE),
    );

    expect(document.header.protocolVersions).toEqual({ "base-reducer": 2 });
  });

  it("rejects a create that records no protocol version", async () => {
    await expect(
      seedAndRebuild(
        createCreateDocumentOperation(
          generateId(),
          DOC_TYPE,
          {},
          { protocolVersions: undefined },
        ),
      ),
    ).rejects.toThrow(/carries no base-reducer protocol version/);
  });
});
