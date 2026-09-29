import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readCatchUpStatus,
  type CatchUpAdminDatabase,
} from "../../src/admin/catch-up-admin.js";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import type { Database } from "../../src/storage/kysely/types.js";
import { indexEntry } from "../catch-up/helpers.js";
import { createTestSyncStoragePostgres } from "../factories.js";

describe("catchup status [Postgres]", () => {
  let db: Kysely<Database>;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const storage = await createTestSyncStoragePostgres();
    db = storage.db;
    cleanup = storage.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("names the session holding the watermark", async () => {
    let finish!: () => void;
    let started!: () => void;
    const writing = new Promise<void>((resolve) => {
      started = resolve;
    });
    const holder = db.transaction().execute(async (trx) => {
      await sql`set local application_name = 'catchup-holder'`.execute(trx);
      await trx
        .insertInto("group_references")
        .values({ documentId: "doc", groupId: "group" })
        .execute();
      started();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    await writing;

    const operationIndex = new KyselyOperationIndex(db);
    const txn = operationIndex.start();
    txn.write([indexEntry("doc-a", 0)]);
    await operationIndex.commit(txn);

    try {
      await vi.waitFor(
        async () => {
          const status = await readCatchUpStatus(
            db as unknown as Kysely<CatchUpAdminDatabase>,
          );
          expect(status.head).toBeGreaterThan(status.settledThrough);
          expect(
            status.sessions.map((session) => session.applicationName),
          ).toContain("catchup-holder");
        },
        { timeout: 10_000, interval: 50 },
      );
    } finally {
      finish();
      await holder;
    }
  });
});
