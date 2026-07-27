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

/**
 * A snapshot labelled R reflects operations 0..R, so its document reports
 * `header.revision[scope] === R + 1`. A keyframe's label is also where a replay
 * resumes, so a label one too high silently drops an operation.
 *
 * ADD_MODULE accumulates; an overwriting action would hide a dropped operation.
 */
function moduleIds(document: PHDocument): string[] {
  const global = (
    document.state as Record<
      string,
      { specifications?: { modules?: { id: string }[] }[] }
    >
  ).global;
  return (global.specifications?.[0]?.modules ?? []).map((m) => m.id);
}

describe("write cache snapshot revision labels", () => {
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
    await seedSpine(docId);
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

  async function seedSpine(id: string): Promise<void> {
    await store.apply(id, DOC_TYPE, "document", BRANCH, 0, (txn) => {
      txn.addOperations(createCreateDocumentOperation(id, DOC_TYPE));
    });
    await store.apply(id, DOC_TYPE, "document", BRANCH, 1, (txn) => {
      txn.addOperations({
        id: `${id}-document-1`,
        index: 1,
        timestampUtcMs: "2026-01-01T10:00:00.000Z",
        hash: "spine-1",
        skip: 0,
        action: upgradeDocumentAction({
          documentId: id,
          model: DOC_TYPE,
          fromVersion: 0,
          toVersion: 1,
          initialState: documentModelDocumentModelModule.utils.createState(),
        }) as never,
      });
    });
  }

  async function appendGlobal(id: string, through: number): Promise<void> {
    for (let i = 0; i <= through; i++) {
      await store.apply(id, DOC_TYPE, "global", BRANCH, i, (txn) => {
        txn.addOperations({
          id: `${id}-global-${i}`,
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

  it("labels a head snapshot by last operation index, not by count", async () => {
    await appendGlobal(docId, 4);

    await cache.getState(docId, "global", BRANCH);

    const labels = cache
      .getStream(docId, "global", BRANCH)
      ?.ringBuffer.getAll()
      .map((snapshot) => snapshot.revision);

    expect(labels).toEqual([4]);
  });

  it("resumes from its own keyframe without dropping an operation", async () => {
    await appendGlobal(docId, 10);

    await cache.getState(docId, "global", BRANCH);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const keyframes = await keyframeStore.listKeyframes(
      docId,
      "global",
      BRANCH,
    );
    expect(keyframes.map((k) => k.revision)).toEqual([10]);
    expect(moduleIds(keyframes[0].document)).toHaveLength(11);

    await appendGlobal(docId, 12);
    cache.invalidate(docId, "global", BRANCH);
    const viaKeyframe = await cache.getState(docId, "global", BRANCH, 12);

    await keyframeStore.deleteKeyframes(docId, "global", BRANCH);
    cache.invalidate(docId, "global", BRANCH);
    const fromScratch = await cache.getState(docId, "global", BRANCH, 12);

    expect(moduleIds(viaKeyframe)).toEqual(moduleIds(fromScratch));
  });

  it("reads a head keyframe left over from the count convention", async () => {
    await appendGlobal(docId, 11);

    // What the old cold head path wrote: state after 9, filed under 10.
    const afterNine = await cache.getState(docId, "global", BRANCH, 9);
    await keyframeStore.putKeyframe(docId, "global", BRANCH, 10, {
      ...afterNine,
      header: { ...afterNine.header, revision: { document: 2, global: 10 } },
      operations: {},
      clipboard: [],
    } as never);

    cache.invalidate(docId, "global", BRANCH);
    const viaLegacy = await cache.getState(docId, "global", BRANCH, 11);

    await keyframeStore.deleteKeyframes(docId, "global", BRANCH);
    cache.invalidate(docId, "global", BRANCH);
    const fromScratch = await cache.getState(docId, "global", BRANCH, 11);

    expect(moduleIds(viaLegacy)).toEqual(moduleIds(fromScratch));
  });

  it("reads a positional keyframe left over from the count convention", async () => {
    await appendGlobal(docId, 24);

    // The harder leftover: a row holding position 10 advertising the store
    // head. Trusting that would resume 14 operations too late.
    const atTen = await cache.getState(docId, "global", BRANCH, 10);
    await keyframeStore.putKeyframe(docId, "global", BRANCH, 10, {
      ...atTen,
      header: { ...atTen.header, revision: { document: 2, global: 25 } },
      operations: {},
      clipboard: [],
    } as never);

    cache.invalidate(docId, "global", BRANCH);
    const viaLegacy = await cache.getState(docId, "global", BRANCH, 24);

    await keyframeStore.deleteKeyframes(docId, "global", BRANCH);
    cache.invalidate(docId, "global", BRANCH);
    const fromScratch = await cache.getState(docId, "global", BRANCH, 24);

    expect(moduleIds(viaLegacy)).toHaveLength(25);
    expect(moduleIds(viaLegacy)).toEqual(moduleIds(fromScratch));
  });
});
