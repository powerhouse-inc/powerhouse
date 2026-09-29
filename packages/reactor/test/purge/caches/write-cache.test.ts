import { generateId } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import { SnapshotPosition } from "../../../src/cache/write-cache-types.js";
import { DocumentModelRegistry } from "../../../src/registry/implementation.js";
import {
  DocumentNotFoundError,
  DocumentPurgedError,
} from "../../../src/shared/errors.js";
import type { KyselyKeyframeStore } from "../../../src/storage/kysely/keyframe-store.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { createTestOperationStorePostgres } from "../../factories.js";
import { purgeMarker, seedPurgedDocument } from "../helpers.js";
import {
  appendGlobal,
  appendMarkerAt,
  createDocument,
  deleteOperations,
} from "./fixtures.js";

describe("write cache over a purged stream", () => {
  let db: Kysely<Database>;
  let store: KyselyOperationStore;
  let keyframeStore: KyselyKeyframeStore;
  let index: KyselyOperationIndex;
  let registry: DocumentModelRegistry;
  let cleanup: () => Promise<void>;

  function newCache(): KyselyWriteCache {
    return new KyselyWriteCache(keyframeStore, store, registry, {
      maxDocuments: 10,
      ringBufferSize: 5,
      keyframeInterval: 1000,
    });
  }

  beforeEach(async () => {
    const setup = await createTestOperationStorePostgres();
    db = setup.db;
    store = setup.store;
    keyframeStore = setup.keyframeStore;
    index = new KyselyOperationIndex(db);
    registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("rebuilds a history ending in a marker as deleted at purgedAtUtcIso", async () => {
    const documentId = generateId();
    await createDocument(store, documentId);
    await appendGlobal(store, documentId, 3);
    const marker = purgeMarker(documentId, {
      timestampUtcMs: "2026-09-01T00:00:00.000Z",
    });
    await appendMarkerAt(store, marker, 2);

    for (const scope of ["document", "global"]) {
      const document = await newCache().getState(documentId, scope, "main");
      expect(document.state.document.isDeleted).toBe(true);
      expect(document.state.document.deletedAtUtcIso).toBe(
        "2026-09-01T00:00:00.000Z",
      );
    }
  });

  it("applies a marker recorded after the keyframe it resumes from", async () => {
    const documentId = generateId();
    await createDocument(store, documentId);
    await appendGlobal(store, documentId, 5);
    const atThree = await newCache().getState(documentId, "global", "main", 3);
    await keyframeStore.putKeyframe(documentId, "global", "main", 3, {
      ...atThree,
      operations: {},
      clipboard: [],
    });
    const marker = purgeMarker(documentId);
    await appendMarkerAt(store, marker, 2);
    const findNearest = vi.spyOn(keyframeStore, "findNearestKeyframe");

    // Head reads never resume from a keyframe; a positional one does.
    const document = await newCache().getState(documentId, "global", "main", 4);

    expect(await findNearest.mock.results[0]?.value).toMatchObject({
      revision: 3,
    });
    expect(document.state.document.isDeleted).toBe(true);
    expect(document.state.document.deletedAtUtcIso).toBe(
      marker.action.input.purgedAtUtcIso,
    );
  });

  it("throws DocumentPurgedError for a lone marker, in every scope, caching nothing", async () => {
    const documentId = generateId();
    await seedPurgedDocument({ db, store, index }, purgeMarker(documentId));
    const cache = newCache();

    for (const [scope, revision] of [
      ["document", undefined],
      ["global", undefined],
      ["document", 0],
      ["global", 3],
    ] as const) {
      const error = await cache
        .getState(documentId, scope, "main", revision)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DocumentPurgedError);
      expect(error).toBeInstanceOf(DocumentNotFoundError);
      expect(DocumentNotFoundError.isError(error)).toBe(true);
      expect(DocumentPurgedError.isError(error)).toBe(true);
      expect(cache.getStream(documentId, scope, "main")).toBeUndefined();
    }
  });

  it("invalidate(id) evicts every scope, so the next read sees the purge", async () => {
    const documentId = generateId();
    await createDocument(store, documentId);
    await appendGlobal(store, documentId, 2);
    const cache = newCache();
    await cache.getState(documentId, "document", "main");
    const global = await cache.getState(documentId, "global", "main");
    cache.putState(
      documentId,
      "local",
      "main",
      0,
      global,
      SnapshotPosition.Head,
    );

    await deleteOperations(db, documentId);
    await seedPurgedDocument({ db, store, index }, purgeMarker(documentId));

    // A head hit never reads the store: only eviction makes the purge visible.
    const stale = await cache.getState(documentId, "global", "main");
    expect(stale.state.document.isDeleted).toBeFalsy();

    expect(cache.invalidate(documentId)).toBe(3);
    await expect(
      cache.getState(documentId, "global", "main"),
    ).rejects.toBeInstanceOf(DocumentPurgedError);
  });
});
