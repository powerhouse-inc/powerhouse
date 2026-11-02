import type { PHDocument } from "@powerhousedao/shared/document-model";
import { addModule, generateId } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { upgradeDocumentAction } from "../../../src/actions/index.js";
import { passthroughKeyframeStore } from "../../../src/admin/passthrough-keyframe-store.js";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import { SnapshotPosition } from "../../../src/cache/write-cache-types.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import type { KeyframeSettings } from "../../../src/storage/keyframes/keyframe-settings.js";
import type { KyselyKeyframeStore } from "../../../src/storage/kysely/keyframe-store.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database } from "../../../src/storage/kysely/types.js";
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

describe("keyframes pruned on write", () => {
  let db: Kysely<Database>;
  let store: KyselyOperationStore;
  let keyframeStore: KyselyKeyframeStore;
  let registry: DocumentModelRegistry;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db;
    store = setup.store;
    keyframeStore = setup.keyframeStore;
    cleanup = setup.cleanup;

    registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);
  });

  afterEach(async () => {
    try {
      await db.destroy();
    } catch {
      // already destroyed
    }
    await cleanup();
  });

  async function revisions(
    documentId: string,
    scope = "global",
  ): Promise<number[]> {
    const rows = await keyframeStore.listKeyframes(documentId, scope, BRANCH);
    return rows.map((row) => row.revision);
  }

  function emptyDocument(): PHDocument {
    return documentModelDocumentModelModule.utils.createDocument();
  }

  describe("putKeyframeAndPrune", () => {
    it("keeps the newest keep rows, counting the one written", async () => {
      for (const revision of [10, 20, 30]) {
        await keyframeStore.putKeyframe(
          "doc",
          "global",
          BRANCH,
          revision,
          emptyDocument(),
        );
      }

      await keyframeStore.putKeyframeAndPrune(
        "doc",
        "global",
        BRANCH,
        40,
        emptyDocument(),
        2,
      );

      expect(await revisions("doc")).toEqual([30, 40]);
    });

    it("leaves one row with keep 1", async () => {
      await keyframeStore.putKeyframe(
        "doc",
        "global",
        BRANCH,
        10,
        emptyDocument(),
      );

      await keyframeStore.putKeyframeAndPrune(
        "doc",
        "global",
        BRANCH,
        20,
        emptyDocument(),
        1,
      );

      expect(await revisions("doc")).toEqual([20]);
    });

    it("clears a backlog at once", async () => {
      for (let revision = 10; revision <= 100; revision += 10) {
        await keyframeStore.putKeyframe(
          "doc",
          "global",
          BRANCH,
          revision,
          emptyDocument(),
        );
      }

      await keyframeStore.putKeyframeAndPrune(
        "doc",
        "global",
        BRANCH,
        110,
        emptyDocument(),
        3,
      );

      expect(await revisions("doc")).toEqual([90, 100, 110]);
    });

    it("overwrites the same revision without losing it", async () => {
      await keyframeStore.putKeyframe(
        "doc",
        "global",
        BRANCH,
        10,
        emptyDocument(),
      );

      await keyframeStore.putKeyframeAndPrune(
        "doc",
        "global",
        BRANCH,
        10,
        emptyDocument(),
        1,
      );

      expect(await revisions("doc")).toEqual([10]);
    });

    it("never removes a keyframe newer than the one a late write adds", async () => {
      for (const revision of [10, 30]) {
        await keyframeStore.putKeyframe(
          "doc",
          "global",
          BRANCH,
          revision,
          emptyDocument(),
        );
      }

      await keyframeStore.putKeyframeAndPrune(
        "doc",
        "global",
        BRANCH,
        20,
        emptyDocument(),
        1,
      );

      expect(await revisions("doc")).toEqual([20, 30]);
    });

    it("touches only its own stream", async () => {
      const put = (documentId: string, scope: string, branch: string) =>
        keyframeStore.putKeyframe(
          documentId,
          scope,
          branch,
          10,
          emptyDocument(),
        );
      await put("doc", "global", BRANCH);
      await put("doc", "document", BRANCH);
      await put("doc", "global", "other");
      await put("other", "global", BRANCH);

      await keyframeStore.putKeyframeAndPrune(
        "doc",
        "global",
        BRANCH,
        20,
        emptyDocument(),
        1,
      );

      expect(await revisions("doc")).toEqual([20]);
      expect(await revisions("doc", "document")).toEqual([10]);
      expect(await revisions("other")).toEqual([10]);
      const otherBranch = await keyframeStore.listKeyframes(
        "doc",
        "global",
        "other",
      );
      expect(otherBranch.map((row) => row.revision)).toEqual([10]);
    });

    it("rolls back with the job's transaction", async () => {
      await keyframeStore.putKeyframe(
        "doc",
        "global",
        BRANCH,
        10,
        emptyDocument(),
      );

      await expect(
        db.transaction().execute(async (trx) => {
          await keyframeStore
            .withTransaction(trx)
            .putKeyframeAndPrune(
              "doc",
              "global",
              BRANCH,
              20,
              emptyDocument(),
              1,
            );
          throw new Error("job failed");
        }),
      ).rejects.toThrow("job failed");

      expect(await revisions("doc")).toEqual([10]);
    });
  });

  describe("through the write cache", () => {
    async function seedDocument(
      documentId: string,
      lastGlobalIndex: number,
    ): Promise<void> {
      await store.apply(documentId, DOC_TYPE, "document", BRANCH, 0, (txn) => {
        txn.addOperations(
          createCreateDocumentOperation(
            documentId,
            DOC_TYPE,
            {},
            { protocolVersions: { "base-reducer": 2 } },
          ),
        );
      });
      await store.apply(documentId, DOC_TYPE, "document", BRANCH, 1, (txn) => {
        txn.addOperations({
          id: `${documentId}-document-1`,
          index: 1,
          timestampUtcMs: "2026-01-01T10:00:00.000Z",
          hash: "spine-1",
          skip: 0,
          action: upgradeDocumentAction({
            documentId,
            model: DOC_TYPE,
            fromVersion: 0,
            toVersion: 1,
            initialState: documentModelDocumentModelModule.utils.createState(),
          }) as never,
        });
      });
      for (let index = 0; index <= lastGlobalIndex; index++) {
        await store.apply(
          documentId,
          DOC_TYPE,
          "global",
          BRANCH,
          index,
          (txn) => {
            txn.addOperations({
              id: `${documentId}-global-${index}`,
              index,
              timestampUtcMs: new Date(
                Date.UTC(2026, 0, 1, 11, 0, index),
              ).toISOString(),
              hash: `h${index}`,
              skip: 0,
              action: addModule({
                id: `mod-${index}`,
                name: `m${index}`,
              }) as never,
            });
          },
        );
      }
    }

    function cacheWith(keyframes: KeyframeSettings): KyselyWriteCache {
      return new KyselyWriteCache(keyframeStore, store, registry, {
        maxDocuments: 10,
        ringBufferSize: 30,
        keyframeInterval: 10,
        keyframes,
      });
    }

    function replayOnly(): KyselyWriteCache {
      return new KyselyWriteCache(passthroughKeyframeStore, store, registry, {
        maxDocuments: 10,
        ringBufferSize: 30,
        keyframeInterval: Number.MAX_SAFE_INTEGER,
      });
    }

    async function settleWrites(): Promise<void> {
      await db.selectFrom("Keyframe").select("id").limit(1).execute();
    }

    async function writeHeads(
      documentId: string,
      cache: KyselyWriteCache,
      lastRevision: number,
    ): Promise<void> {
      const replay = replayOnly();
      for (let revision = 10; revision <= lastRevision; revision += 10) {
        const document = await replay.getState(
          documentId,
          "global",
          BRANCH,
          revision,
        );
        cache.putState(
          documentId,
          "global",
          BRANCH,
          revision,
          document,
          SnapshotPosition.Head,
        );
        await settleWrites();
      }
    }

    it("keep 1 leaves the newest keyframe and every read still answers", async () => {
      const documentId = generateId();
      await seedDocument(documentId, 35);

      await writeHeads(documentId, cacheWith({ default: { keep: 1 } }), 30);
      expect(await revisions(documentId)).toEqual([30]);

      const replay = replayOnly();
      for (const target of [0, 5, 9, 10, 15, 29, 30, 31, 35]) {
        const cold = cacheWith({ default: { keep: 1 } });
        const read = await cold.getState(documentId, "global", BRANCH, target);
        replay.invalidate(documentId);
        const expected = await replay.getState(
          documentId,
          "global",
          BRANCH,
          target,
        );
        expect(moduleIds(read)).toEqual(moduleIds(expected));
        expect(read.state).toEqual(expected.state);
      }

      const head = await cacheWith({ default: { keep: 1 } }).getState(
        documentId,
        "global",
        BRANCH,
      );
      expect(moduleIds(head)).toHaveLength(36);
    });

    it("keeps all of them with keep unlimited", async () => {
      const documentId = generateId();
      await seedDocument(documentId, 30);

      await writeHeads(documentId, cacheWith({}), 30);

      expect(await revisions(documentId)).toEqual([10, 20, 30]);
    });

    it("keeps a type's own count over the default", async () => {
      const documentId = generateId();
      await seedDocument(documentId, 30);

      await writeHeads(
        documentId,
        cacheWith({
          default: { keep: 1 },
          types: { [DOC_TYPE]: { keep: 2 } },
        }),
        30,
      );

      expect(await revisions(documentId)).toEqual([20, 30]);
    });
  });
});
