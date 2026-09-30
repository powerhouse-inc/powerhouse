import { generateId } from "@powerhousedao/shared/document-model";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addRelationshipAction } from "../../../src/actions/index.js";
import { JobStatus } from "../../../src/shared/types.js";
import {
  acquirePurgeLocks,
  PURGE_LOCK_BUCKETS,
  PURGE_NS,
} from "../../../src/storage/kysely/document-purges.js";
import {
  createTestDatabase,
  legacyDrive,
  settled,
  startReactor,
  succeeded,
  type PurgeReactor,
  type TestDatabase,
} from "../executor/harness.js";

describe("purge locks stay within the shared lock table [Postgres]", () => {
  let database: TestDatabase;
  let host: PurgeReactor;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_review_r3_lock_limit");
    host = await startReactor(database, {
      executorConfig: { jobTimeoutMs: 120_000 },
    });
  });

  afterAll(async () => {
    try {
      await host?.kill();
    } finally {
      await database?.drop();
    }
  });

  it("locks 50k ids in one transaction on at most the bucket count", async () => {
    const ids = Array.from({ length: 50_000 }, (_, i) => `doc-${i}`);
    const held = await database.base.transaction().execute(async (trx) => {
      await acquirePurgeLocks(trx, ids, "shared");
      const result = await sql<{ n: number }>`
        select count(*)::int as n from pg_locks
        where locktype = 'advisory' and pid = pg_backend_pid()
          and classid = ${sql.lit(PURGE_NS)}::oid and objsubid = 2
      `.execute(trx);
      return result.rows[0]!.n;
    });
    expect(held).toBeLessThanOrEqual(PURGE_LOCK_BUCKETS);
  });

  it("runs a drive job adding 16k children", async () => {
    const drive = legacyDrive();
    await succeeded(host.reactor, (await host.reactor.create(drive)).id);
    const driveId = drive.header.id;
    const actions = Array.from({ length: 16_000 }, () =>
      addRelationshipAction(driveId, generateId(), "child"),
    );
    const { id } = await host.reactor.execute(driveId, "main", actions);
    await vi.waitUntil(
      async () => {
        const status = (await host.reactor.getJobStatus(id)).status;
        return status === JobStatus.READ_READY || status === JobStatus.FAILED;
      },
      { timeout: 150_000, interval: 200 },
    );
    const info = await settled(host.reactor, id);
    expect(info.error?.message).toBeUndefined();
    expect(info.status).toBe(JobStatus.READ_READY);
  }, 180_000);
});
