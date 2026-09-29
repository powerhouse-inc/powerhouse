import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import {
  createKyselyWatermarkProbe,
  SettledWatermark,
} from "../../../src/catch-up/settled-watermark.js";
import { BaseReadModel } from "../../../src/read-models/base-read-model.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { indexEntry } from "../../catch-up/helpers.js";
import { createTestSyncStoragePostgres } from "../../factories.js";

const READ_MODEL_ID = "catch-up-head-model";

class RecordingModel extends BaseReadModel {
  readonly applied: number[] = [];

  protected override commitOperations(
    items: OperationWithContext[],
  ): Promise<void> {
    this.applied.push(...items.map((item) => item.context.ordinal));
    return Promise.resolve();
  }
}

describe("BaseReadModel catch-up [Postgres]", () => {
  let db: Kysely<Database>;
  let cleanup: () => Promise<void>;
  let operationIndex: KyselyOperationIndex;
  let watermark: SettledWatermark;

  beforeEach(async () => {
    const storage = await createTestSyncStoragePostgres();
    db = storage.db;
    cleanup = storage.cleanup;
    operationIndex = new KyselyOperationIndex(db);
    watermark = new SettledWatermark(
      createKyselyWatermarkProbe(db),
      new ConsoleLogger(["test"]),
    );
  });

  afterEach(async () => {
    await cleanup();
  });

  async function commit(...documentIds: string[]): Promise<number[]> {
    const txn = operationIndex.start();
    txn.write(documentIds.map((documentId) => indexEntry(documentId, 0)));
    return operationIndex.commit(txn);
  }

  /** An index commit that took its ordinal and waits for the test to commit. */
  function openIndexWrite(documentId: string): {
    ordinal: Promise<number>;
    finish: () => Promise<void>;
  } {
    let resolveOrdinal!: (ordinal: number) => void;
    const ordinal = new Promise<number>((resolve) => {
      resolveOrdinal = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const done = db.transaction().execute(async (trx) => {
      const txn = operationIndex.start();
      txn.write([indexEntry(documentId, 0)]);
      const [taken] = await operationIndex.withTransaction(trx).commit(txn);
      resolveOrdinal(taken!);
      await released;
    });
    return {
      ordinal,
      finish: async () => {
        release();
        await done;
      },
    };
  }

  it("replays no history for a head registration made while a write is open", async () => {
    await commit("doc-a", "doc-b", "doc-c");
    const open = openIndexWrite("doc-open");
    await open.ordinal;
    const [head] = await commit("doc-after");

    const model = new RecordingModel(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      {} as IWriteCache,
      new ConsistencyTracker(),
      {
        readModelId: READ_MODEL_ID,
        rebuildStateOnInit: false,
        startFrom: "head",
      },
    );
    let startedAt: number;
    try {
      await model.init();
      startedAt = model.appliedThrough;
    } finally {
      await open.finish();
    }

    const [later] = await commit("doc-later");
    await vi.waitFor(
      async () => {
        expect(await watermark.refresh()).toBeGreaterThanOrEqual(later!);
      },
      { timeout: 10_000, interval: 50 },
    );
    const settled = watermark.settledThrough;
    await model.sweep(
      settled,
      await operationIndex.getOrdinalsInRange(
        model.appliedThrough,
        settled,
        1000,
      ),
    );

    expect(model.applied).toEqual([later]);
    expect(startedAt).toBe(head!);
  });
});
