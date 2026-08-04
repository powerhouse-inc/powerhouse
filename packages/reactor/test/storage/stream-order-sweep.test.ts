import { generateId, type Action } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sweepStreamOrder } from "../../src/admin/stream-order-sweep.js";
import type { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import type { Database as DatabaseSchema } from "../../src/storage/kysely/types.js";
import { createTestOperationStore } from "../factories.js";

describe("sweepStreamOrder", () => {
  let db: Kysely<DatabaseSchema>;
  let store: KyselyOperationStore;

  const scope = "auth";
  const branch = "main";
  const documentType = "powerhouse/test";

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db;
    store = setup.store;
  });

  afterEach(async () => {
    await db.destroy();
  });

  async function seedStream(
    documentId: string,
    timestamps: string[],
  ): Promise<void> {
    for (let i = 0; i < timestamps.length; i++) {
      const action: Action = {
        type: "ADD_GRANT",
        input: {},
        scope,
        id: generateId(),
        timestampUtcMs: timestamps[i],
      };
      await store.apply(documentId, documentType, scope, branch, i, (txn) => {
        txn.addOperations({
          index: i,
          timestampUtcMs: timestamps[i],
          hash: generateId(),
          skip: 0,
          id: generateId(),
          action,
        });
      });
    }
  }

  it("reports the same-millisecond stream and passes the ordered one", async () => {
    const orderedId = generateId();
    const tiedId = generateId();

    await seedStream(orderedId, [
      "2026-01-01T00:00:01.000Z",
      "2026-01-01T00:00:02.000Z",
    ]);
    await seedStream(tiedId, [
      "2026-01-01T00:00:01.000Z",
      "2026-01-01T00:00:01.000Z",
    ]);

    const result = await sweepStreamOrder(db, store);

    expect(result.streamsChecked).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].documentId).toBe(tiedId);
    expect(result.failures[0].branch).toBe(branch);
    expect(result.failures[0].pair.kind).toBe("tied");
    expect(result.failures[0].pair.previous.index).toBe(0);
    expect(result.failures[0].pair.current.index).toBe(1);
  });
});
