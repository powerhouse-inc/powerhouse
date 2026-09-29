import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import {
  createKyselyWatermarkProbe,
  SettledWatermark,
} from "../../src/catch-up/settled-watermark.js";
import type { Database } from "../../src/storage/kysely/types.js";
import { createTestSyncStorage } from "../factories.js";
import { indexEntry } from "./helpers.js";

class RollbackSignal extends Error {}

describe("SettledWatermark [PGlite]", () => {
  let db: Kysely<Database>;
  let operationIndex: KyselyOperationIndex;
  let watermark: SettledWatermark;

  beforeEach(async () => {
    const storage = await createTestSyncStorage();
    db = storage.db;
    operationIndex = new KyselyOperationIndex(db);
    watermark = new SettledWatermark(
      createKyselyWatermarkProbe(db),
      new ConsoleLogger(["test"]),
    );
  });

  afterEach(async () => {
    await db.destroy();
  });

  async function commit(documentId: string, index: number): Promise<number> {
    const txn = operationIndex.start();
    txn.write([indexEntry(documentId, index)]);
    const [ordinal] = await operationIndex.commit(txn);
    return ordinal!;
  }

  it("settles at zero on an empty index", async () => {
    expect(await watermark.refresh()).toBe(0);
  });

  it("passes a rolled-back ordinal on the next probe", async () => {
    const first = await commit("doc-a", 0);

    let rolledBack = 0;
    await expect(
      db.transaction().execute(async (trx) => {
        const txn = operationIndex.start();
        txn.write([indexEntry("doc-b", 0)]);
        [rolledBack] = await operationIndex.withTransaction(trx).commit(txn);
        throw new RollbackSignal();
      }),
    ).rejects.toBeInstanceOf(RollbackSignal);
    expect(rolledBack).toBe(first + 1);

    expect(await watermark.refresh()).toBe(rolledBack);
    expect(await operationIndex.getOrdinalsInRange(0, rolledBack, 10)).toEqual([
      first,
    ]);

    const after = await commit("doc-c", 0);
    expect(after).toBe(rolledBack + 1);
    expect(await watermark.refresh()).toBe(after);
  });
});
