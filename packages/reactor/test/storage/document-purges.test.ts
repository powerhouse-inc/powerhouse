import { sql, type Kysely, type Transaction } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquirePurgeLocks,
  findPurged,
  listPurged,
  PURGE_NS,
} from "../../src/storage/kysely/document-purges.js";
import type { Database } from "../../src/storage/kysely/types.js";
import {
  createTestOperationStore,
  createTestOperationStorePostgres,
} from "../factories.js";
import { seedTombstone } from "../purge/helpers.js";

type Setup = {
  db: Kysely<Database>;
  cleanup: () => Promise<void>;
};

// PGlite reports its single backend's locks with a null pid.
async function heldPurgeLocks(
  trx: Transaction<Database>,
): Promise<{ mode: string }[]> {
  const result = await sql<{ mode: string }>`
    select mode from pg_locks
    where locktype = 'advisory' and objsubid = 2
      and classid = ${sql.lit(PURGE_NS)}::oid
      and (pid = pg_backend_pid() or pid is null)
    order by mode
  `.execute(trx);
  return result.rows;
}

const backends: [string, () => Promise<Setup>][] = [
  [
    "PGlite",
    async () => {
      const setup = await createTestOperationStore();
      return {
        db: setup.db,
        cleanup: async () => {
          await setup.db.destroy();
          await setup.cleanup();
        },
      };
    },
  ],
  ["Postgres", createTestOperationStorePostgres],
];

describe.each(backends)("document_purges on %s", (_name, create) => {
  let setup: Setup;

  beforeEach(async () => {
    setup = await create();
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  it("migrates up to the tombstone table", async () => {
    await seedTombstone(setup.db, "doc-a", 42, {
      removedRows: { Operation: 3, Keyframe: 1 },
      purgedAtUtc: new Date("2026-09-29T00:00:00.000Z"),
      requestId: "request-a",
    });

    const row = await setup.db
      .selectFrom("document_purges")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(Number(row.ordinal)).toBe(42);
    expect(row.removedRows).toEqual({ Operation: 3, Keyframe: 1 });
    expect(new Date(row.purgedAtUtc).toISOString()).toBe(
      "2026-09-29T00:00:00.000Z",
    );
    expect(row.requestId).toBe("request-a");

    await expect(seedTombstone(setup.db, "doc-a", 43)).rejects.toThrow();
  });

  it("finds the tombstoned ids among those asked for", async () => {
    await seedTombstone(setup.db, "doc-a", 1);
    await seedTombstone(setup.db, "doc-b", 2);

    expect(await findPurged(setup.db, [])).toEqual(new Set());
    expect(
      await findPurged(setup.db, ["doc-a", "doc-c", "doc-b", "doc-a"]),
    ).toEqual(new Set(["doc-a", "doc-b"]));
    expect(await listPurged(setup.db)).toEqual(["doc-a", "doc-b"]);
  });

  it("reads tombstones inside a transaction", async () => {
    await setup.db.transaction().execute(async (trx) => {
      await seedTombstone(trx, "doc-a", 1);
      expect(await findPurged(trx, ["doc-a"])).toEqual(new Set(["doc-a"]));
    });
  });

  it("takes one two-key lock per distinct id, in the chosen mode", async () => {
    await setup.db.transaction().execute(async (trx) => {
      await acquirePurgeLocks(trx, [], "shared");
      expect(await heldPurgeLocks(trx)).toEqual([]);

      await acquirePurgeLocks(trx, ["doc-b", "doc-a", "doc-b"], "shared");
      expect(await heldPurgeLocks(trx)).toEqual([
        { mode: "ShareLock" },
        { mode: "ShareLock" },
      ]);

      await acquirePurgeLocks(trx, ["doc-c"], "exclusive");
      expect(await heldPurgeLocks(trx)).toEqual([
        { mode: "ExclusiveLock" },
        { mode: "ShareLock" },
        { mode: "ShareLock" },
      ]);
    });

    await setup.db.transaction().execute(async (trx) => {
      expect(await heldPurgeLocks(trx)).toEqual([]);
    });
  });
});

/** Contention needs a pool; PGlite is one connection. */
describe("purge locks under contention (Postgres)", () => {
  let setup: Setup;

  beforeEach(async () => {
    setup = await createTestOperationStorePostgres();
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  function holder(fn: (trx: Transaction<Database>) => Promise<void>): {
    held: Promise<void>;
    release: () => Promise<void>;
  } {
    let heldResolve!: () => void;
    const held = new Promise<void>((resolve) => {
      heldResolve = resolve;
    });
    let releaseResolve!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });
    const done = setup.db.transaction().execute(async (trx) => {
      await fn(trx);
      heldResolve();
      await released;
    });
    return {
      held,
      release: async () => {
        releaseResolve();
        await done;
      },
    };
  }

  async function settlesWithin(
    promise: Promise<unknown>,
    ms: number,
  ): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), ms);
    });
    const settled = await Promise.race([promise.then(() => true), timeout]);
    clearTimeout(timer);
    return settled;
  }

  it("does not block a shared lock behind another shared lock", async () => {
    const first = holder((trx) => acquirePurgeLocks(trx, ["doc-a"], "shared"));
    await first.held;

    const second = holder((trx) =>
      acquirePurgeLocks(trx, ["doc-a", "doc-b"], "shared"),
    );
    expect(await settlesWithin(second.held, 5_000)).toBe(true);

    await second.release();
    await first.release();
  });

  it("blocks a shared lock behind an exclusive lock until it commits", async () => {
    const purge = holder((trx) =>
      acquirePurgeLocks(trx, ["doc-a"], "exclusive"),
    );
    await purge.held;

    const writer = holder((trx) =>
      acquirePurgeLocks(trx, ["doc-b", "doc-a"], "shared"),
    );
    expect(await settlesWithin(writer.held, 300)).toBe(false);

    await purge.release();
    expect(await settlesWithin(writer.held, 5_000)).toBe(true);
    await writer.release();
  });

  it("blocks an exclusive lock behind a shared lock", async () => {
    const writer = holder((trx) => acquirePurgeLocks(trx, ["doc-a"], "shared"));
    await writer.held;

    const purge = holder((trx) =>
      acquirePurgeLocks(trx, ["doc-a"], "exclusive"),
    );
    expect(await settlesWithin(purge.held, 300)).toBe(false);

    await writer.release();
    expect(await settlesWithin(purge.held, 5_000)).toBe(true);
    await purge.release();
  });

  it("does not collide with the stream lock on the same id", async () => {
    const stream = holder(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtext(${"doc-a"}))`.execute(
        trx,
      );
    });
    await stream.held;

    const purge = holder((trx) =>
      acquirePurgeLocks(trx, ["doc-a"], "exclusive"),
    );
    expect(await settlesWithin(purge.held, 5_000)).toBe(true);

    await purge.release();
    await stream.release();
  });

  it("sees a tombstone once the purge holding the lock commits", async () => {
    const purge = holder(async (trx) => {
      await acquirePurgeLocks(trx, ["doc-a"], "exclusive");
      await seedTombstone(trx, "doc-a", 7);
    });
    await purge.held;

    const seen = setup.db.transaction().execute(async (trx) => {
      await acquirePurgeLocks(trx, ["doc-a"], "shared");
      return findPurged(trx, ["doc-a"]);
    });
    expect(await settlesWithin(seen, 300)).toBe(false);

    await purge.release();
    expect(await seen).toEqual(new Set(["doc-a"]));
  });
});
