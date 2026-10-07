import { PGlite } from "@electric-sql/pglite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Kysely, sql } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StorageSessionRecreatedEvent } from "../../../src/events/types.js";
import {
  HardenedPGliteDialect,
  PGliteSessionPoisonedError,
} from "../../../src/storage/kysely/pglite-dialect.js";
import {
  SelfHealingPGliteClient,
  type RecreatablePGliteInstance,
} from "../../../src/storage/kysely/self-healing-pglite-client.js";

const ACQUIRE_TIMEOUT_MS = 250;

/** A fake instance that records calls and closes; no real database behind it. */
class FakeInstance implements RecreatablePGliteInstance {
  closed = false;
  readonly queries: string[] = [];
  /** How many real filesystem syncs this instance was asked for. */
  syncCount = 0;
  /** Delay applied to each sync, so group commit has something to coalesce. */
  syncDelayMs = 0;

  constructor(readonly label: string) {}

  syncToFs(): Promise<void> {
    this.syncCount += 1;
    if (this.syncDelayMs === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) =>
      setTimeout(resolve, this.syncDelayMs),
    );
  }

  query(
    sql: string,
    _params?: unknown[],
  ): Promise<{ rows: unknown[]; affectedRows?: number }> {
    this.queries.push(sql);
    return Promise.resolve({ rows: [{ from: this.label }] });
  }

  exec(sql: string): Promise<unknown> {
    this.queries.push(sql);
    return Promise.resolve(undefined);
  }

  isInTransaction(): boolean {
    return false;
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

describe("SelfHealingPGliteClient", () => {
  it("delegates to the current instance, and to the new one after a recreate", async () => {
    const first = new FakeInstance("first");
    const second = new FakeInstance("second");
    const client = new SelfHealingPGliteClient(first, {
      openInstance: () => Promise.resolve(second),
      onDiagnostic: () => undefined,
    });

    expect(await client.query("select a")).toEqual({
      rows: [{ from: "first" }],
    });
    expect(client.current).toBe(first);

    const recreated = await client.recreate("portal stuck");
    expect(recreated).toBe(true);

    // Every holder reaching the database through this one client now talks to
    // the replacement, with no rewiring on their side.
    expect(client.current).toBe(second);
    expect(await client.query("select b")).toEqual({
      rows: [{ from: "second" }],
    });
    expect(first.closed).toBe(true);
  });

  it("is single-flight: concurrent recreations collapse into one", async () => {
    const first = new FakeInstance("first");
    const openInstance = vi.fn(() =>
      Promise.resolve(new FakeInstance("second")),
    );
    const client = new SelfHealingPGliteClient(first, {
      openInstance,
      onDiagnostic: () => undefined,
    });

    const results = await Promise.all([
      client.recreate("a"),
      client.recreate("b"),
      client.recreate("c"),
    ]);

    expect(results).toEqual([true, true, true]);
    expect(openInstance).toHaveBeenCalledTimes(1);
    expect(client.recreateCount).toBe(1);
  });

  it("emits one recovery event per recreate, with reason and timestamp", async () => {
    const events: StorageSessionRecreatedEvent[] = [];
    const client = new SelfHealingPGliteClient(new FakeInstance("first"), {
      openInstance: () => Promise.resolve(new FakeInstance("next")),
      onRecreated: (event) => events.push(event),
      onDiagnostic: () => undefined,
    });

    const before = Date.now();
    await client.recreate("stuck portal");
    await client.recreate("stuck portal again");

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ reason: "stuck portal", attempt: 1 });
    expect(events[1]).toMatchObject({
      reason: "stuck portal again",
      attempt: 2,
    });
    expect(events[0].timestampUtcMs).toBeGreaterThanOrEqual(before);
  });

  it("reports failure when a replacement cannot open, having already closed the poisoned instance", async () => {
    const first = new FakeInstance("first");
    const diagnostics: string[] = [];
    const client = new SelfHealingPGliteClient(first, {
      openInstance: () => Promise.reject(new Error("idb unavailable")),
      onDiagnostic: (message) => diagnostics.push(message),
    });

    const recreated = await client.recreate("portal stuck");

    expect(recreated).toBe(false);
    // close-then-open: the poisoned instance is closed before the replacement is
    // attempted, so a failed open leaves the DB down and the host escalates. The
    // client keeps pointing at the old (now closed) instance; it is not swapped.
    expect(client.current).toBe(first);
    expect(first.closed).toBe(true);
    expect(client.recreateCount).toBe(0);
    expect(diagnostics.join(" ")).toContain("replacement");
  });

  it("closes the poisoned instance before opening the replacement (never two instances on one store)", async () => {
    const order: string[] = [];
    const first = new FakeInstance("first");
    const originalClose = first.close.bind(first);
    first.close = () => {
      order.push("close-first");
      return originalClose();
    };
    const second = new FakeInstance("second");
    const client = new SelfHealingPGliteClient(first, {
      openInstance: () => {
        order.push("open-second");
        // The poisoned instance must already be gone: a second live instance on
        // the same idb store would race its close-time flush against this one.
        expect(first.closed).toBe(true);
        return Promise.resolve(second);
      },
      onDiagnostic: () => undefined,
    });

    const recreated = await client.recreate("portal stuck");

    expect(recreated).toBe(true);
    expect(order).toEqual(["close-first", "open-second"]);
    expect(client.current).toBe(second);
    expect(second.closed).toBe(false);
  });

  it("resolves as soon as the replacement is live, with no extra close afterwards", async () => {
    const first = new FakeInstance("first");
    let closeResolved = false;
    first.close = () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          first.closed = true;
          closeResolved = true;
          resolve();
        }, 20),
      );
    const second = new FakeInstance("second");
    const client = new SelfHealingPGliteClient(first, {
      openInstance: () => Promise.resolve(second),
      onDiagnostic: () => undefined,
    });

    const recreated = await client.recreate("portal stuck");

    // The only close is the pre-open one; by the time recreate resolves it has
    // completed and nothing is deferred, so a waiter on the lease is not held for
    // a close after the fresh instance is already live.
    expect(recreated).toBe(true);
    expect(closeResolved).toBe(true);
    expect(client.current).toBe(second);
    expect(second.closed).toBe(false);
  });

  it("escalates instead of opening a second instance when the poisoned close hangs", async () => {
    const first = new FakeInstance("first");
    first.close = () => new Promise<void>(() => undefined);
    const openInstance = vi.fn(() =>
      Promise.resolve(new FakeInstance("second")),
    );
    const diagnostics: string[] = [];
    const client = new SelfHealingPGliteClient(first, {
      openInstance,
      onDiagnostic: (message) => diagnostics.push(message),
      closeTimeoutMs: 20,
    });

    const recreated = await client.recreate("portal stuck");

    expect(recreated).toBe(false);
    // A wedged teardown may still hold the store, so no replacement is opened.
    expect(openInstance).not.toHaveBeenCalled();
    expect(client.current).toBe(first);
    expect(client.recreateCount).toBe(0);
    expect(diagnostics.join(" ")).toContain("timed out");
  });
});

/**
 * A real PGlite wrapped so its ROLLBACK can be blocked, reproducing the stuck
 * `PORTAL_ACTIVE` session the dialect refuses as unrecoverable. The only cure
 * is tearing the instance down and reopening - which is exactly what the
 * coordinator's `openInstance` does, so these tests drive the full dialect ->
 * poison -> recreate -> retry path end to end.
 */
type Poisonable = RecreatablePGliteInstance & { pg: PGlite };

async function openPoisonable(): Promise<Poisonable> {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec("create table t (id int primary key)");
  let blocked = false;
  return {
    pg,
    syncToFs: () => pg.syncToFs(),
    query: (text: string, params?: unknown[]) => {
      if (blocked && /^\s*rollback/i.test(text)) {
        return Promise.reject(new Error('cannot drop active portal ""'));
      }
      return pg.query(text, params);
    },
    exec: (text: string) => {
      if (blocked && /^\s*rollback/i.test(text)) {
        return Promise.reject(new Error('cannot drop active portal ""'));
      }
      // The very first exec after the sabotage is the trigger that wedges the
      // session; expose it so the test can flip the toggle through the client.
      if (text === "__poison__") {
        blocked = true;
        return Promise.resolve(undefined);
      }
      return pg.exec(text);
    },
    isInTransaction: () => pg.isInTransaction(),
    close: () => pg.close(),
  };
}

type Schema = { t: { id: number } };

describe("SelfHealingPGliteClient wired into HardenedPGliteDialect", () => {
  let opened: Poisonable[] = [];

  async function trackOpen(): Promise<Poisonable> {
    const instance = await openPoisonable();
    opened.push(instance);
    return instance;
  }

  afterEach(async () => {
    const toClose = opened;
    opened = [];
    for (const instance of toClose) {
      await instance.pg.close().catch(() => undefined);
    }
  });

  it("auto-heals a poisoned session so the next operation succeeds, and emits the event", async () => {
    const initial = await trackOpen();
    const events: StorageSessionRecreatedEvent[] = [];
    const client = new SelfHealingPGliteClient(initial, {
      openInstance: () => trackOpen(),
      onRecreated: (event) => events.push(event),
      onDiagnostic: () => undefined,
    });
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(client, {
        acquireTimeoutMs: ACQUIRE_TIMEOUT_MS,
        onDiagnostic: () => undefined,
        onPoisoned: (cause) =>
          client.recreate(
            cause instanceof Error ? cause.message : String(cause),
          ),
      }),
    });

    // Sabotage the session: the job's own rollback will be refused, leaving the
    // transaction aborted with a portal no statement can drop.
    await client.exec("__poison__");
    const outcome = await db
      .transaction()
      .execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        throw new Error("JOB-FAILED");
      })
      .then(
        () => "resolved",
        (error: Error) => error.message,
      );
    expect(outcome).toContain("JOB-FAILED");

    // The next operation would have thrown PGliteSessionPoisonedError. Instead
    // the dialect asks the coordinator to recreate the instance, re-probes the
    // fresh session, and the statement succeeds against it.
    const healed = await sql<{ x: number }>`select 1 as x`.execute(db);
    expect(healed.rows).toEqual([{ x: 1 }]);

    expect(client.recreateCount).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0].reason).toContain("cannot drop active portal");
  });

  it("recreates once when several operations hit the same poisoned session", async () => {
    const initial = await trackOpen();
    let recreateCalls = 0;
    const client = new SelfHealingPGliteClient(initial, {
      openInstance: () => {
        recreateCalls += 1;
        return trackOpen();
      },
      onDiagnostic: () => undefined,
    });
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(client, {
        acquireTimeoutMs: ACQUIRE_TIMEOUT_MS,
        onDiagnostic: () => undefined,
        onPoisoned: (cause) =>
          client.recreate(
            cause instanceof Error ? cause.message : String(cause),
          ),
      }),
    });

    await client.exec("__poison__");
    await db
      .transaction()
      .execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        throw new Error("JOB-FAILED");
      })
      .catch(() => undefined);

    const [a, b, c] = await Promise.all([
      sql<{ x: number }>`select 1 as x`.execute(db),
      sql<{ x: number }>`select 2 as x`.execute(db),
      sql<{ x: number }>`select 3 as x`.execute(db),
    ]);

    expect(a.rows).toEqual([{ x: 1 }]);
    expect(b.rows).toEqual([{ x: 2 }]);
    expect(c.rows).toEqual([{ x: 3 }]);
    expect(recreateCalls).toBe(1);
    expect(client.recreateCount).toBe(1);
  });

  it("still refuses loudly when no replacement can be opened", async () => {
    const initial = await trackOpen();
    const client = new SelfHealingPGliteClient(initial, {
      openInstance: () => Promise.reject(new Error("no storage")),
      onDiagnostic: () => undefined,
    });
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(client, {
        acquireTimeoutMs: ACQUIRE_TIMEOUT_MS,
        onDiagnostic: () => undefined,
        onPoisoned: (cause) =>
          client.recreate(
            cause instanceof Error ? cause.message : String(cause),
          ),
      }),
    });

    await client.exec("__poison__");
    await db
      .transaction()
      .execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        throw new Error("JOB-FAILED");
      })
      .catch(() => undefined);

    const refused = await sql`select 1 as x`.execute(db).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(PGliteSessionPoisonedError);
  });

  it("fires a reload signal and refuses loudly when the holder self-heals by reload, not in-place recreate", async () => {
    // Mirrors the relational store's onPoisoned (reactor.worker.ts): its `live`
    // query handles rule out an in-place instance swap, so instead of recreating
    // it requests a host reload and returns false. The dialect then throws the
    // loud poisoned error for the current caller while the reload recovers the
    // process, rather than bricking forever with no recovery path.
    const initial = await trackOpen();
    const reload = vi.fn();
    const client = new SelfHealingPGliteClient(initial, {
      openInstance: () => trackOpen(),
      onDiagnostic: () => undefined,
    });
    const db = new Kysely<Schema>({
      dialect: new HardenedPGliteDialect(client, {
        acquireTimeoutMs: ACQUIRE_TIMEOUT_MS,
        onDiagnostic: () => undefined,
        onPoisoned: () => {
          reload();
          return Promise.resolve(false);
        },
      }),
    });

    await client.exec("__poison__");
    await db
      .transaction()
      .execute(async (trx) => {
        await sql`insert into t (id) values (1)`.execute(trx);
        throw new Error("JOB-FAILED");
      })
      .catch(() => undefined);

    const refused = await sql`select 1 as x`.execute(db).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(PGliteSessionPoisonedError);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(client.recreateCount).toBe(0);
  });
});

describe("SelfHealingPGliteClient against durable storage", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function openDurable(dir: string): Promise<RecreatablePGliteInstance> {
    // File-backed, not relaxedDurability: a commit is flushed before it resolves,
    // which is the durability mode the reactor's authoritative store now opens in
    // so a recreate (close + reopen) reads back everything that was acknowledged.
    const pg = new PGlite(dir, { relaxedDurability: false });
    await pg.waitReady;
    return {
      query: (text, params) => pg.query(text, params),
      exec: (text) => pg.exec(text),
      isInTransaction: () => pg.isInTransaction(),
      close: () => pg.close(),
      syncToFs: () => pg.syncToFs(),
    };
  }

  it("reads back a committed op after a recreate (no acknowledged write is lost)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "self-heal-durable-"));
    dirs.push(dir);
    const initial = await openDurable(dir);
    const client = new SelfHealingPGliteClient(initial, {
      openInstance: () => openDurable(dir),
      onDiagnostic: () => undefined,
    });

    await client.exec("create table ops (id int primary key)");
    await client.exec("insert into ops (id) values (42)");

    const recreated = await client.recreate("portal stuck");
    expect(recreated).toBe(true);

    // The replacement opened against the same durable store after the poisoned
    // instance was closed, so the committed-and-flushed row is read back.
    const after = await client.query("select id from ops order by id");
    expect(after.rows).toEqual([{ id: 42 }]);

    await client.close();
  });
});
