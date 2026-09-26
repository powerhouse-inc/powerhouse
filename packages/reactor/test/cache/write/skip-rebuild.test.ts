import type { PHDocument } from "@powerhousedao/shared/document-model";
import { addModule, generateId } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// A skip replays from initialState over the document's operations list.
function moduleIds(document: PHDocument): string[] {
  const global = (
    document.state as Record<
      string,
      { specifications?: { modules?: { id: string }[] }[] }
    >
  ).global;
  return (global.specifications?.[0]?.modules ?? []).map((m) => m.id);
}

function expectedIds(through: number, skip: number): string[] {
  const kept = Array.from({ length: through - skip }, (_, i) => `mod-${i}`);
  return [...kept, `mod-${through}`];
}

describe("write cache rebuild across a skip", () => {
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

  async function append(index: number, skip = 0): Promise<void> {
    await store.apply(docId, DOC_TYPE, "global", BRANCH, index, (txn) => {
      txn.addOperations({
        id: `${docId}-global-${index}`,
        index,
        timestampUtcMs: new Date(
          Date.UTC(2026, 0, 1, 11, 0, index),
        ).toISOString(),
        hash: `h${index}`,
        skip,
        action: addModule({ id: `mod-${index}`, name: `m${index}` }) as never,
      });
    });
  }

  async function appendThrough(through: number): Promise<void> {
    for (let i = 0; i <= through; i++) {
      await append(i);
    }
  }

  async function persistKeyframeAt(revision: number): Promise<void> {
    await cache.getState(docId, "global", BRANCH, revision);
    await expect
      .poll(async () =>
        (await keyframeStore.listKeyframes(docId, "global", BRANCH)).map(
          (k) => k.revision,
        ),
      )
      .toContain(revision);
    cache.clear();
  }

  describe.each([
    { name: "reaching below the keyframe", skip: 6 },
    { name: "staying above the keyframe", skip: 2 },
  ])("cold, from a keyframe, with a skip $name", ({ skip }) => {
    beforeEach(async () => {
      await appendThrough(14);
      await persistKeyframeAt(10);
      await append(15, skip);
    });

    it("rebuilds the target revision from the whole log", async () => {
      const document = await cache.getState(docId, "global", BRANCH, 15);

      expect(moduleIds(document)).toEqual(expectedIds(15, skip));
    });

    it("rebuilds the head from the whole log", async () => {
      const document = await cache.getState(docId, "global", BRANCH);

      expect(moduleIds(document)).toEqual(expectedIds(15, skip));
    });
  });

  describe.each([
    { name: "reaching below the snapshot", skip: 3 },
    { name: "staying above the snapshot", skip: 1 },
  ])("warm, from a snapshot, with a skip $name", ({ skip }) => {
    beforeEach(async () => {
      await appendThrough(6);
      await cache.getState(docId, "global", BRANCH, 4);
      await append(7, skip);
    });

    it("rebuilds the target revision from the whole log", async () => {
      const document = await cache.getState(docId, "global", BRANCH, 7);

      expect(moduleIds(document)).toEqual(expectedIds(7, skip));
    });

    it("rebuilds the head from the whole log", async () => {
      const document = await cache.getState(docId, "global", BRANCH);

      expect(moduleIds(document)).toEqual(expectedIds(7, skip));
    });
  });

  it("still builds on a snapshot when nothing it applies skips", async () => {
    await appendThrough(7);
    await cache.getState(docId, "global", BRANCH, 4);
    const getSince = vi.spyOn(store, "getSince");

    const document = await cache.getState(docId, "global", BRANCH, 7);

    expect(moduleIds(document)).toEqual(expectedIds(7, 0));
    const globalReads = getSince.mock.calls.filter(
      ([, scope]) => scope === "global",
    );
    expect(globalReads.map(([, , , revision]) => revision)).toEqual([4]);
  });
});
