import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import {
  createKyselyWatermarkProbe,
  SettledWatermark,
} from "../../src/catch-up/settled-watermark.js";
import type { Database } from "../../src/storage/kysely/types.js";
import { createTestSyncStoragePostgres } from "../factories.js";
import { indexEntry } from "./helpers.js";

class RollbackSignal extends Error {}

type OpenTransaction = {
  ordinal: Promise<number>;
  finish(outcome: "commit" | "rollback"): Promise<void>;
};

describe("SettledWatermark [Postgres]", () => {
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

  async function commit(documentId: string): Promise<number> {
    const txn = operationIndex.start();
    txn.write([indexEntry(documentId, 0)]);
    const [ordinal] = await operationIndex.commit(txn);
    return ordinal!;
  }

  /** An index commit that took its ordinal and waits for the test. */
  function openIndexWrite(documentId: string): OpenTransaction {
    let resolveOrdinal!: (ordinal: number) => void;
    const ordinal = new Promise<number>((resolve) => {
      resolveOrdinal = resolve;
    });
    let decide!: (outcome: "commit" | "rollback") => void;
    const decided = new Promise<"commit" | "rollback">((resolve) => {
      decide = resolve;
    });

    const done = db
      .transaction()
      .execute(async (trx) => {
        const txn = operationIndex.start();
        txn.write([indexEntry(documentId, 0)]);
        const [taken] = await operationIndex.withTransaction(trx).commit(txn);
        resolveOrdinal(taken!);
        if ((await decided) === "rollback") throw new RollbackSignal();
      })
      .catch((error: unknown) => {
        if (!(error instanceof RollbackSignal)) throw error;
      });

    return {
      ordinal,
      finish: async (outcome) => {
        decide(outcome);
        await done;
      },
    };
  }

  /** Other test files write to the same cluster; retry until they pass. */
  async function refreshUntil(predicate: (settled: number) => boolean) {
    await vi.waitUntil(async () => predicate(await watermark.refresh()), {
      timeout: 10_000,
      interval: 20,
    });
  }

  it("holds below an ordinal whose transaction is open", async () => {
    const open = openIndexWrite("doc-open");
    const held = await open.ordinal;
    const later = await commit("doc-later");
    expect(later).toBeGreaterThan(held);

    for (let i = 0; i < 3; i++) {
      expect(await watermark.refresh()).toBeLessThan(held);
    }
    expect(watermark.status().head).toBeGreaterThanOrEqual(later);
    expect(watermark.status().waitingOn.length).toBeGreaterThan(0);

    await open.finish("commit");
  });

  it("passes it once that transaction rolls back", async () => {
    const open = openIndexWrite("doc-rolled-back");
    const held = await open.ordinal;
    const later = await commit("doc-later");
    expect(await watermark.refresh()).toBeLessThan(held);

    await open.finish("rollback");
    await refreshUntil((settled) => settled >= later);
    expect(await operationIndex.getOrdinalsInRange(0, later, 10)).toEqual([
      later,
    ]);
  });

  it("shows the row to the next read once it commits", async () => {
    const open = openIndexWrite("doc-committed");
    const held = await open.ordinal;
    const later = await commit("doc-later");
    expect(await operationIndex.getOrdinalsInRange(0, later, 10)).toEqual([
      later,
    ]);
    expect(await watermark.refresh()).toBeLessThan(held);

    await open.finish("commit");
    await refreshUntil((settled) => settled >= later);
    expect(await operationIndex.getOrdinalsInRange(0, later, 10)).toEqual([
      held,
      later,
    ]);
  });

  it("is held by an open write to another table, not by an open read-only transaction", async () => {
    const before = await commit("doc-before");
    await refreshUntil((settled) => settled >= before);

    let finishRead!: () => void;
    const readDone = db.transaction().execute(async (trx) => {
      await trx.selectFrom("group_references").selectAll().execute();
      await new Promise<void>((resolve) => {
        finishRead = resolve;
      });
    });
    const readOnlyHeld = await commit("doc-read-only");
    await refreshUntil((settled) => settled >= readOnlyHeld);
    finishRead();
    await readDone;

    let finishWrite!: () => void;
    let wrote!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      wrote = resolve;
    });
    const writeDone = db.transaction().execute(async (trx) => {
      await trx
        .insertInto("group_references")
        .values({ documentId: "doc-referencer", groupId: "group" })
        .execute();
      wrote();
      await new Promise<void>((resolve) => {
        finishWrite = resolve;
      });
    });
    await writeStarted;
    const writeHeld = await commit("doc-write");
    for (let i = 0; i < 3; i++) {
      expect(await watermark.refresh()).toBeLessThan(writeHeld);
    }

    finishWrite();
    await writeDone;
    await refreshUntil((settled) => settled >= writeHeld);
  });
});
