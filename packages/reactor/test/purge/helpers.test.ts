import {
  deriveOperationId,
  generateId,
  isPurgeMarker,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import { verifyActionSignature } from "../../src/signer/verify-action-signature.js";
import { findPurged } from "../../src/storage/kysely/document-purges.js";
import type { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import type { Database } from "../../src/storage/kysely/types.js";
import { createTestOperationStore } from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";
import {
  purgeMarker,
  seedPurgedDocument,
  signedPurgeMarker,
} from "./helpers.js";

describe("purge test helpers", () => {
  it("builds the single-row marker the spec describes", () => {
    const marker = purgeMarker("doc-1", { actionId: "action-1" });
    expect(isPurgeMarker(marker)).toBe(true);
    expect(marker).toMatchObject({
      id: deriveOperationId("doc-1", "document", "main", "action-1"),
      index: 0,
      skip: 0,
      hash: "",
      timestampUtcMs: marker.action.timestampUtcMs,
      action: { scope: "document", input: { documentId: "doc-1" } },
    });
  });

  it("signs a marker that load admission verifies as v2", async () => {
    const signer = await TestP256Signer.create();
    const marker = await signedPurgeMarker(signer.asISigner(), "doc-1");
    expect(
      await verifyActionSignature(
        marker.action,
        { documentId: "doc-1", branch: "main", policy: "v2-required" },
        "load",
        marker,
      ),
    ).toEqual({ ok: true, scheme: "v2" });
  });

  describe("seedPurgedDocument", () => {
    let db: Kysely<Database>;
    let store: KyselyOperationStore;
    let index: KyselyOperationIndex;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const setup = await createTestOperationStore();
      db = setup.db;
      store = setup.store;
      index = new KyselyOperationIndex(db);
      cleanup = async () => {
        await db.destroy();
        await setup.cleanup();
      };
    });

    afterEach(async () => {
      await cleanup();
    });

    it("writes the marker, its index twin and the tombstone", async () => {
      const documentId = generateId();
      const collectionId = DriveCollectionId.forDrive("drive-1").key;
      const marker = purgeMarker(documentId);
      const ordinal = await seedPurgedDocument({ db, store, index }, marker, {
        collectionIds: [collectionId],
        reopenMemberships: db,
        removedRows: { Operation: 4 },
      });

      const operations = await db
        .selectFrom("Operation")
        .select(["index", "opId"])
        .where("documentId", "=", documentId)
        .execute();
      expect(operations).toEqual([{ index: 0, opId: marker.id }]);

      const twin = await db
        .selectFrom("operation_index_operations")
        .select(["ordinal", "documentType"])
        .where("documentId", "=", documentId)
        .execute();
      expect(twin).toEqual([
        { ordinal, documentType: marker.action.input.documentType },
      ]);

      const membership = await db
        .selectFrom("document_collections")
        .select(["joinedOrdinal", "leftOrdinal"])
        .where("documentId", "=", documentId)
        .executeTakeFirstOrThrow();
      expect(Number(membership.joinedOrdinal)).toBe(ordinal);
      expect(membership.leftOrdinal).toBeNull();

      const tombstone = await db
        .selectFrom("document_purges")
        .selectAll()
        .executeTakeFirstOrThrow();
      expect(Number(tombstone.ordinal)).toBe(ordinal);
      expect(tombstone.removedRows).toEqual({ Operation: 4 });
      expect(tombstone.requestId).toBe(marker.action.input.requestId);
      expect(await findPurged(db, [documentId])).toEqual(new Set([documentId]));
    });
  });
});
