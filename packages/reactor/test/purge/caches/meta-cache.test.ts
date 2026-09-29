import {
  createDocumentState,
  generateId,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DocumentMetaCache } from "../../../src/cache/document-meta-cache.js";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { createTestOperationStorePostgres } from "../../factories.js";
import { purgeMarker, seedPurgedDocument } from "../helpers.js";
import {
  appendMarkerAt,
  createDocument,
  deleteOperations,
} from "./fixtures.js";

describe("document meta cache over a purged stream", () => {
  let db: Kysely<Database>;
  let store: KyselyOperationStore;
  let index: KyselyOperationIndex;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStorePostgres();
    db = setup.db;
    store = setup.store;
    index = new KyselyOperationIndex(db);
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("builds deleted meta from a lone marker, with derived protocol versions", async () => {
    const documentId = generateId();
    const marker = purgeMarker(documentId, {
      documentType: "powerhouse/document-drive",
    });
    await seedPurgedDocument({ db, store, index }, marker);

    // A fresh cache over a fresh store: what a restarted reactor reads.
    const cache = new DocumentMetaCache(new KyselyOperationStore(db), {
      maxDocuments: 10,
    });
    const meta = await cache.getDocumentMeta(documentId, "main");

    expect(meta).toEqual({
      state: createDocumentState({
        isDeleted: true,
        deletedAtUtcIso: marker.action.input.purgedAtUtcIso,
      }),
      documentType: "powerhouse/document-drive",
      protocolVersions: { "document-purge": 1 },
      documentScopeRevision: 1,
    });
    await expect(
      cache.rebuildAtRevision(documentId, "main", 0),
    ).resolves.toEqual(meta);
  });

  it("applies a marker ending a history as a deletion that derives its versions", async () => {
    const documentId = generateId();
    await createDocument(store, documentId, { "base-reducer": 2 });
    const marker = purgeMarker(documentId);
    await appendMarkerAt(store, marker, 2);
    const cache = new DocumentMetaCache(store, { maxDocuments: 10 });

    const meta = await cache.getDocumentMeta(documentId, "main");
    expect(meta.state.isDeleted).toBe(true);
    expect(meta.state.deletedAtUtcIso).toBe(marker.action.input.purgedAtUtcIso);
    expect(meta.protocolVersions).toEqual({ "document-purge": 1 });
    expect(meta.documentScopeRevision).toBe(3);

    const before = await cache.rebuildAtRevision(documentId, "main", 1);
    expect(before.state.isDeleted).toBeFalsy();
    expect(before.protocolVersions).toEqual({ "base-reducer": 2 });
  });

  it("invalidate(id) drops the pre-purge meta the cache held", async () => {
    const documentId = generateId();
    await createDocument(store, documentId, { "base-reducer": 2 });
    const cache = new DocumentMetaCache(store, { maxDocuments: 10 });
    expect(
      (await cache.getDocumentMeta(documentId, "main")).protocolVersions,
    ).toEqual({ "base-reducer": 2 });

    await deleteOperations(db, documentId);
    await seedPurgedDocument({ db, store, index }, purgeMarker(documentId));
    expect(
      (await cache.getDocumentMeta(documentId, "main")).protocolVersions,
    ).toEqual({ "base-reducer": 2 });

    expect(cache.invalidate(documentId)).toBe(1);
    expect(
      (await cache.getDocumentMeta(documentId, "main")).protocolVersions,
    ).toEqual({ "document-purge": 1 });
  });
});
