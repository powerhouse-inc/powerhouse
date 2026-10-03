/**
 * Repro harness for mechanism (A) of
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md
 * and the analysis in docs/bugs/2026-10-03-sync-defect-analysis.md.
 *
 * The live defect: the worker reactor's single shared PGlite session ended with
 * `current transaction is aborted, commands ignored until end of transaction
 * block` for every statement, and `ROLLBACK` itself failing with
 * `cannot drop active portal ""`. Only a worker restart cleared it.
 *
 * Everything below asserts the CORRECT behaviour, so every test fails against
 * current code. They are `describe.skip`ped so CI stays green until the fixes
 * land as their own reviewed work packages.
 *
 * Scope note: these are harnesses, not a byte-exact reproduction of the live
 * failure. The one piece that cannot be reproduced in a unit test is the
 * *initial* stuck `PORTAL_ACTIVE` state, which needs a wasm-level fault inside
 * `mod._interactive_one` (see the analysis doc, "what cannot be unit-tested").
 * What IS reproduced faithfully and deterministically is every reactor-side
 * amplifier that turns a one-off session fault into a permanent brick.
 */
import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { describe, expect, it } from "vitest";
import { HardenedPGliteDialect } from "../../src/storage/kysely/pglite-dialect.js";

type Row = { id: number };
type Schema = { t: Row };

/** Short acquire bound so a parked waiter is observable inside a test. */
const ACQUIRE_TIMEOUT_MS = 250;

async function freshDb(): Promise<{ pg: PGlite; db: Kysely<Schema> }> {
  const pg = new PGlite();
  await pg.waitReady;
  const db = new Kysely<Schema>({
    dialect: new HardenedPGliteDialect(pg, {
      acquireTimeoutMs: ACQUIRE_TIMEOUT_MS,
      onDiagnostic: () => undefined,
    }),
  });
  await sql`create table t (id int primary key)`.execute(db);
  return { pg, db };
}

describe("mechanism A: the shared PGlite session is poisonable and unrecoverable", () => {
  /**
   * The driver's mutex (kysely-pglite-dialect PGliteDriver.acquireConnection)
   * only serialises *Kysely's own* callers. PGlite's `#transactionMutex` is
   * taken and released per `client.query()`, and the dialect opens a
   * transaction with a bare `client.query("begin")` -- so it never holds that
   * mutex across BEGIN..COMMIT.
   *
   * The worker's inspector DB capability is exactly such a bypassing caller:
   * apps/connect/src/reactor.worker.ts:142-147 calls
   * `owned.reactorPg.query(sql, params)` on the raw client, and the Connect DB
   * explorer lets an operator type arbitrary SQL into it.
   *
   * Correct behaviour: a statement issued outside the reactor's Kysely instance
   * must not land inside the reactor's open write transaction.
   *
   * STAYS SKIPPED, and will: no dialect can give this guarantee. PGlite has
   * one session, so a statement issued straight at the client is inside
   * whatever transaction is open on it, by construction. The fix is to remove
   * the bypassing caller rather than to defend against it: mechanism A-3
   * routes every inspector `queryDb` through the reactor's own Kysely (and so
   * through the dialect's serialising queue). What now covers that:
   * `queryThroughDialect` plus its test in
   * test/storage/kysely/pglite-dialect.test.ts ("serialises a raw inspector
   * query behind an open transaction"), and the two tests below, which pin the
   * consequence this bypass used to have.
   */
  it.skip("does not let a non-Kysely statement execute inside a Kysely transaction", async () => {
    const { pg, db } = await freshDb();

    const tx = db.transaction().execute(async (trx) => {
      await sql`insert into t (id) values (1)`.execute(trx);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return "tx-ok";
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Seeing the uncommitted row proves the interloper is inside the same
    // session, inside the reactor's open BEGIN block.
    const peek = await pg.query<Row>("select id from t");
    expect(peek.rows).toEqual([]);

    await tx;
    await pg.close();
  });

  /**
   * The consequence of the bypass, and the whole of addendum 1's
   * "33 revisions 'ingested' but never durably committed".
   *
   * Postgres answers COMMIT on an aborted transaction with a ROLLBACK command
   * tag and NO error. Kysely does not inspect the tag, so
   * `db.transaction().execute()` RESOLVES with the callback's return value
   * while nothing was written. The executor then reports the job COMPLETED
   * (SimpleJobExecutor.executeJob returns `outcome.result` after the scope
   * resolves -- src/executor/simple-job-executor.ts:392-446), the sync manager
   * removes the SyncOperation from the inbox, and the inbox cursor advances
   * past data that does not exist.
   *
   * Correct behaviour: a transaction that committed nothing must not resolve
   * successfully.
   */
  it("fails the transaction when its COMMIT silently degraded to a ROLLBACK", async () => {
    const { pg, db } = await freshDb();

    let resolvedWith: unknown;
    let threw: unknown;
    try {
      resolvedWith = await db.transaction().execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        // Stands in for an interleaved failing statement from another consumer
        // of the same session whose caller swallowed its own error.
        try {
          await sql`select 1 / 0`.execute(trx);
        } catch {
          /* swallowed, exactly as an unrelated caller would */
        }
        return "JOB-SUCCEEDED";
      });
    } catch (error) {
      threw = error;
    }

    const rows = await sql<Row>`select id from t`.execute(db);
    expect(rows.rows).toEqual([]);
    // Durability and the reported outcome must agree.
    expect(threw).toBeDefined();
    expect(resolvedWith).toBeUndefined();
    await pg.close();
  });

  /**
   * The same thing with the abort arriving from outside the Kysely transaction,
   * which is the live profile: a raw inspector query erroring while a load job
   * holds an open BEGIN.
   */
  it("fails the transaction when an outside statement aborted it", async () => {
    const { pg, db } = await freshDb();

    const tx = db.transaction().execute(async (trx) => {
      await sql`insert into t (id) values (2)`.execute(trx);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return "JOB-SUCCEEDED";
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await pg.query("select 1 / 0").catch(() => undefined);

    const outcome = await tx.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const rows = await sql<Row>`select id from t`.execute(db);

    expect(rows.rows).toEqual([]);
    expect(outcome.ok).toBe(false);
    await pg.close();
  });

  /**
   * THE BRICK, and the reason a restart was the only cure.
   *
   * Kysely's transaction body (node_modules/kysely/dist/esm/kysely.js:568-582)
   * is:
   *
   *     try {
   *       await driver.beginTransaction(connection, settings)
   *       transactionBegun = true
   *       ...
   *     } catch (error) {
   *       if (transactionBegun) { await driver.rollbackTransaction(connection) }
   *       throw error
   *     }
   *
   * When the session is ALREADY in an aborted transaction, `beginTransaction`
   * is the statement that fails, so `transactionBegun` stays false and Kysely
   * never attempts a ROLLBACK. The poisoned state is therefore self-
   * perpetuating by construction: no amount of subsequent reactor traffic will
   * ever try to clear it. `PGliteDriver.releaseConnection` resets nothing
   * either, so the poisoned session is handed straight to the next waiter
   * (DefaultConnectionProvider releases in a `finally`, whatever happened).
   *
   * Correct behaviour: the storage layer must recover a session it finds in an
   * aborted transaction rather than returning that error forever.
   */
  it("recovers a session left in an aborted transaction", async () => {
    const { pg, db } = await freshDb();

    // Stands in for the live state: a transaction is open on the shared
    // session and has been aborted, with nothing left that will end it.
    await pg.query("BEGIN");
    await pg.query("select 1 / 0").catch(() => undefined);
    expect(pg.isInTransaction()).toBe(true);

    const read = await sql<{ x: number }>`select 1 as x`
      .execute(db)
      .then((r) => r.rows)
      .catch((error: Error) => ({ err: error.message }));
    expect(read).toEqual([{ x: 1 }]);

    const write = await db
      .transaction()
      .execute(async (trx) => {
        await sql`insert into t (id) values (9)`.execute(trx);
        return "ok";
      })
      .catch((error: Error) => ({ err: error.message }));
    expect(write).toBe("ok");
    await pg.close();
  });

  /**
   * Closest faithful harness for the `cannot drop active portal ""` half.
   *
   * The real trigger is a stuck `PORTAL_ACTIVE` unnamed portal, which makes
   * `exec_bind_message` refuse to replace it. Every statement PGlite sends --
   * ROLLBACK included -- goes through the extended protocol and binds the
   * unnamed portal, which is why no SQL could recover the live session. We
   * cannot create that state from JS (see the analysis doc), so the portal is
   * simulated by making ROLLBACK reject at the client.
   *
   * What this still proves for real: when `rollbackTransaction` fails, the
   * rollback error REPLACES the original failure (so the real cause is lost to
   * the logs), and the connection is released with the transaction still open
   * and nothing resetting it.
   *
   * Correct behaviour: a failed rollback must not leave the session in a
   * transaction, and must not swallow the original error.
   */
  it("does not release a connection whose rollback failed", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    await pg.query("create table t (id int primary key)");

    const portalStuck = { value: false };
    const client = new Proxy(pg, {
      get(target, prop, receiver) {
        if (prop === "query") {
          return async (text: string, params?: unknown[]) => {
            if (portalStuck.value && /^\s*rollback/i.test(text)) {
              throw new Error('cannot drop active portal ""');
            }
            return target.query(text, params);
          };
        }
        const value = Reflect.get(target, prop, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(client as unknown as PGlite, {
        acquireTimeoutMs: ACQUIRE_TIMEOUT_MS,
        onDiagnostic: () => undefined,
      }),
    });

    portalStuck.value = true;
    const outcome = await db
      .transaction()
      .execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        throw new Error("JOB-FAILED");
      })
      .then(
        () => ({ message: "resolved" }),
        (error: Error) => ({ message: error.message }),
      );

    // The job's own failure must survive; today it is replaced by the rollback's.
    expect(outcome.message).toContain("JOB-FAILED");
    // And the session must not be left mid-transaction for the next caller.
    expect(pg.isInTransaction()).toBe(false);
    await pg.close();
  });

  /**
   * THE DETERMINISTIC POISONER, reproduced exactly as the source shapes it.
   *
   * `KyselyOperationStore.apply` catches `_UniqueConstraintContext` INSIDE the
   * job's transaction (src/storage/kysely/store.ts:86-96) -- at which point the
   * unique-constraint violation has already put the PG transaction into aborted
   * state -- and then calls `resolveUniqueConstraint`, which runs its recovery
   * query against `this.db`, the BASE handle, not the open `trx`
   * (store.ts:133-150, `findIdempotentReplay(this.db, ...)`).
   *
   * On single-connection PGlite the base handle's `acquireConnection` parks on
   * `PGliteDriver.queue` because the transaction still holds the lease, and the
   * transaction is awaiting the parked call. Neither ever completes, so Kysely
   * issues neither COMMIT nor ROLLBACK: the session is left in an open,
   * ABORTED transaction and the driver's lease is held forever. The
   * `catch {}` at store.ts:147 cannot save it -- a deadlock does not throw.
   *
   * `SimpleJobExecutorManager` then abandons the job after `jobTimeoutMs`
   * (30_000 by default) via `Promise.race` against `AbortSignal.timeout`
   * (src/executor/simple-job-executor-manager.ts:186-205) and frees its slot,
   * which is why the live queue reported
   * `{isPaused:false, pendingJobs:[], executingJobs:[]}` while storage was dead.
   *
   * Signature that discriminates this from the portal variant: every statement
   * through the reactor's Kysely HANGS (queued behind the dead lease), while
   * statements issued outside it (the inspector's raw `pg.query`) ERROR with
   * `current transaction is aborted`.
   *
   * Correct behaviour: a recovery path must use the transaction it is inside,
   * and a nested acquisition must fail fast rather than hang.
   */
  it("does not deadlock when a recovery path queries the base handle", async () => {
    const { pg, db } = await freshDb();

    const raced = await Promise.race([
      db
        .transaction()
        .execute(async (trx) => {
          await sql`insert into t (id) values (1)`.execute(trx);
          // Exactly `findIdempotentReplay(this.db, ...)` at store.ts:139.
          await sql`select 1`.execute(db);
          return "ok";
        })
        .then(
          () => "resolved" as const,
          () => "threw" as const,
        ),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 1000)),
    ]);

    expect(raced).not.toBe("hung");
    // And whatever the outcome, the session must not be left in a transaction.
    expect(pg.isInTransaction()).toBe(false);
  });

  /**
   * Latent landmine, and the hypothesis the bug doc led with. RULED OUT as the
   * live cause: packages/reactor/src contains no `.stream()` call at all, and
   * kysely-pglite-dialect's `streamQuery` materialises every row with one
   * `client.query()` before slicing in memory, so it never opens a portal.
   *
   * It is still worth a guard, because the failure it DOES produce is a total
   * deadlock rather than an error: Kysely's `stream()` releases the driver
   * connection in a generator `finally`, so an iterator abandoned without
   * `break`/`return` never releases the PGliteDriver mutex and every later
   * statement hangs forever. That distinct signature (hang, not error) is
   * precisely why the live repro -- where statements *errored* -- was not this.
   *
   * Correct behaviour: an abandoned stream must not wedge the connection pool.
   *
   * STAYS SKIPPED: the leak is in Kysely's `stream()`, whose generator holds
   * the driver connection and releases it in a `finally` that a dropped
   * iterator never runs. A driver cannot observe that, so it cannot release on
   * the consumer's behalf. What the dialect wrapper does do is bound the wait,
   * turning the silent permanent hang into a loud
   * `PGliteAcquireTimeoutError` that names the cause - covered by
   * test/storage/kysely/pglite-dialect.test.ts ("fails loudly instead of
   * hanging when the lease is never returned"). A real fix is the lint ban on
   * `.stream()` from the analysis's hygiene item A-4; `packages/reactor/src`
   * has no `.stream()` call today.
   */
  it.skip("does not deadlock the driver when a stream iterator is abandoned", async () => {
    const { pg, db } = await freshDb();
    await sql`insert into t select generate_series(1, 100)`.execute(db);

    const iterator = db
      .selectFrom("t")
      .selectAll()
      .stream(10)
      [Symbol.asyncIterator]();
    await iterator.next();
    // Deliberately no `iterator.return()`: this models a consumer that drops
    // the iterator on an early return or a thrown error upstream.

    const raced = await Promise.race([
      sql`select 1 as x`.execute(db).then(() => "resolved" as const),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 500)),
    ]);
    expect(raced).toBe("resolved");
    await pg.close();
  });
});
