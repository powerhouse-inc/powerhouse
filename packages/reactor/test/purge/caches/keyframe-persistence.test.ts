import {
  generateId,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import { SnapshotPosition } from "../../../src/cache/write-cache-types.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import { acquirePurgeLocks } from "../../../src/storage/kysely/document-purges.js";
import { KyselyKeyframeStore } from "../../../src/storage/kysely/keyframe-store.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { createTestOperationStorePostgres, deferred } from "../../factories.js";
import { seedTombstone } from "../helpers.js";
import { appendGlobal, countKeyframes, createDocument } from "./fixtures.js";

/** Records every write the cache fires and forgets, so a test can await them. */
class RecordingKeyframeStore extends KyselyKeyframeStore {
  readonly writes: Promise<void>[] = [];

  override putKeyframe(
    ...args: Parameters<KyselyKeyframeStore["putKeyframe"]>
  ): Promise<void> {
    const write = super.putKeyframe(...args);
    this.writes.push(write);
    return write;
  }
}

async function isPending(promise: Promise<unknown>, ms = 300) {
  const timeout = Symbol("pending");
  const winner = await Promise.race([
    promise.then(() => undefined),
    new Promise((resolve) => setTimeout(() => resolve(timeout), ms)),
  ]);
  return winner === timeout;
}

describe("keyframe persistence for a purged id", () => {
  let db: Kysely<Database>;
  let store: KyselyOperationStore;
  let keyframeStore: KyselyKeyframeStore;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStorePostgres();
    db = setup.db;
    store = setup.store;
    keyframeStore = setup.keyframeStore;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  async function documentAt(documentId: string): Promise<PHDocument> {
    await createDocument(store, documentId);
    await appendGlobal(store, documentId, 5);
    const registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);
    const cache = new KyselyWriteCache(keyframeStore, store, registry, {
      maxDocuments: 10,
      ringBufferSize: 5,
      keyframeInterval: 1000,
    });
    return cache.getState(documentId, "global", "main");
  }

  it("writes a keyframe for a live id and nothing for a tombstoned one", async () => {
    const live = generateId();
    const purged = generateId();
    const document = await documentAt(live);
    await seedTombstone(db, purged, 1);

    await keyframeStore.putKeyframe(live, "global", "main", 4, document);
    await keyframeStore.putKeyframe(purged, "global", "main", 4, document);
    await db
      .transaction()
      .execute((trx) =>
        keyframeStore
          .withTransaction(trx)
          .putKeyframe(purged, "global", "main", 2, document),
      );

    expect(await countKeyframes(db, live)).toBe(1);
    expect(await countKeyframes(db, purged)).toBe(0);
  });

  it("drops both write cache keyframe paths for a tombstoned id", async () => {
    const documentId = generateId();
    const document = await documentAt(documentId);
    await seedTombstone(db, documentId, 1);
    const recording = new RecordingKeyframeStore(db);
    const registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);
    const cache = new KyselyWriteCache(recording, store, registry, {
      maxDocuments: 10,
      ringBufferSize: 5,
      keyframeInterval: 2,
    });

    cache.putState(
      documentId,
      "global",
      "main",
      4,
      document,
      SnapshotPosition.Head,
    );
    cache.putRun(documentId, "global", "main", [
      { revision: 2, document },
      { revision: 3, document },
      { revision: 6, document },
    ]);

    expect(recording.writes).toHaveLength(3);
    await Promise.all(recording.writes);
    expect(await countKeyframes(db, documentId)).toBe(0);
  });

  it("waits behind an exclusive purge lock, then writes nothing", async () => {
    const documentId = generateId();
    const document = await documentAt(documentId);
    const locked = deferred();
    const release = deferred();

    const purge = db.transaction().execute(async (trx) => {
      await acquirePurgeLocks(trx, [documentId], "exclusive");
      await seedTombstone(trx, documentId, 1);
      locked.resolve();
      await release.promise;
    });
    await locked.promise;

    const write = keyframeStore.putKeyframe(
      documentId,
      "global",
      "main",
      4,
      document,
    );
    const pending = await isPending(write);
    release.resolve();
    await purge;
    await write;
    expect(pending).toBe(true);
    expect(await countKeyframes(db, documentId)).toBe(0);
  });

  it("waits behind an exclusive lock that commits no tombstone, then writes", async () => {
    const documentId = generateId();
    const document = await documentAt(documentId);
    const locked = deferred();
    const release = deferred();

    const holder = db.transaction().execute(async (trx) => {
      await acquirePurgeLocks(trx, [documentId], "exclusive");
      locked.resolve();
      await release.promise;
    });
    await locked.promise;

    const write = keyframeStore.putKeyframe(
      documentId,
      "global",
      "main",
      4,
      document,
    );
    const pending = await isPending(write);
    release.resolve();
    await holder;
    await write;
    expect(pending).toBe(true);
    expect(await countKeyframes(db, documentId)).toBe(1);
  });
});
