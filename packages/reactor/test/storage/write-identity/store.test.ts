import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WriteIdentityUpsert } from "../../../src/storage/interfaces.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { KyselyWriteIdentityStore } from "../../../src/storage/kysely/write-identity-store.js";
import { createTestOperationStore } from "../../factories.js";

function identity(
  overrides: Partial<WriteIdentityUpsert> & { documentId: string },
): WriteIdentityUpsert {
  return {
    branch: "main",
    slug: null,
    documentType: "powerhouse/test",
    isDeleted: false,
    ...overrides,
  };
}

describe("KyselyWriteIdentityStore", () => {
  let db: Kysely<Database>;
  let cleanup: () => Promise<void>;
  let store: KyselyWriteIdentityStore;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db;
    cleanup = setup.cleanup;
    store = new KyselyWriteIdentityStore(db);
  });

  afterEach(async () => {
    await db.destroy();
    await cleanup();
  });

  it("resolves a document by id", async () => {
    await store.upsert([identity({ documentId: "doc-1", slug: "one" })]);

    const resolved = await store.resolve("doc-1", "main");

    expect(resolved).toMatchObject({
      documentId: "doc-1",
      branch: "main",
      slug: "one",
      documentType: "powerhouse/test",
      isDeleted: false,
    });
  });

  it("resolves a document by slug on its branch only", async () => {
    await store.upsert([
      identity({ documentId: "doc-1", slug: "one" }),
      identity({ documentId: "doc-2", branch: "draft", slug: "two" }),
    ]);

    expect((await store.resolve("one", "main"))?.documentId).toBe("doc-1");
    expect(await store.resolve("one", "draft")).toBeUndefined();
    expect((await store.resolve("two", "draft"))?.documentId).toBe("doc-2");
  });

  it("returns undefined for an unknown identifier", async () => {
    expect(await store.resolve("missing", "main")).toBeUndefined();
  });

  it("throws when the identifier is one document's id and another's slug", async () => {
    await store.upsert([
      identity({ documentId: "doc-1" }),
      identity({ documentId: "doc-2", slug: "doc-1" }),
    ]);

    await expect(store.resolve("doc-1", "main")).rejects.toThrow(
      /Ambiguous identifier "doc-1"/,
    );
  });

  it("resolves a document whose slug and id are both the identifier", async () => {
    await store.upsert([identity({ documentId: "doc-1", slug: "doc-1" })]);

    expect((await store.resolve("doc-1", "main"))?.documentId).toBe("doc-1");
  });

  it("resolves a deleted document by id with isDeleted set", async () => {
    await store.upsert([identity({ documentId: "doc-1", slug: "one" })]);
    await store.upsert([
      identity({ documentId: "doc-1", slug: null, isDeleted: true }),
    ]);

    expect(await store.resolve("doc-1", "main")).toMatchObject({
      documentId: "doc-1",
      slug: null,
      isDeleted: true,
    });
    expect(await store.resolve("one", "main")).toBeUndefined();
  });

  it("moves a claimed slug to the last document that claims it", async () => {
    await store.upsert([identity({ documentId: "doc-1", slug: "shared" })]);
    await store.upsert([identity({ documentId: "doc-2", slug: "shared" })]);

    expect((await store.resolve("shared", "main"))?.documentId).toBe("doc-2");
    expect((await store.describe("doc-1", "main"))?.slug).toBeNull();
  });

  it("describes a document and keeps its creation time across updates", async () => {
    await store.upsert([identity({ documentId: "doc-1", slug: "one" })]);
    const created = await store.describe("doc-1", "main");

    await new Promise((resolve) => setTimeout(resolve, 5));
    await store.upsert([
      identity({
        documentId: "doc-1",
        slug: "uno",
        documentType: "powerhouse/other",
      }),
    ]);
    const updated = await store.describe("doc-1", "main");

    expect(updated).toMatchObject({
      documentId: "doc-1",
      branch: "main",
      slug: "uno",
      documentType: "powerhouse/other",
      isDeleted: false,
      createdAtUtcIso: created!.createdAtUtcIso,
    });
    expect(updated!.updatedAtUtcIso > created!.updatedAtUtcIso).toBe(true);
    expect(await store.describe("doc-1", "draft")).toBeUndefined();
  });

  it("deletes a document's identity on every branch", async () => {
    await store.upsert([
      identity({ documentId: "doc-1", slug: "one" }),
      identity({ documentId: "doc-1", branch: "draft", slug: "one" }),
      identity({ documentId: "doc-2", slug: "two" }),
    ]);

    await store.delete("doc-1");

    expect(await store.describe("doc-1", "main")).toBeUndefined();
    expect(await store.describe("doc-1", "draft")).toBeUndefined();
    expect(await store.describe("doc-2", "main")).toBeDefined();
  });

  it("writes inside the transaction it is bound to", async () => {
    await expect(
      db.transaction().execute(async (trx) => {
        await store
          .withTransaction(trx)
          .upsert([identity({ documentId: "doc-1", slug: "one" })]);
        throw new Error("roll back");
      }),
    ).rejects.toThrow("roll back");

    expect(await store.describe("doc-1", "main")).toBeUndefined();
  });
});
