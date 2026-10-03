import { PGlite } from "@electric-sql/pglite";
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

  constructor(readonly label: string) {}

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

  it("keeps the old instance and reports failure when a replacement cannot open", async () => {
    const first = new FakeInstance("first");
    const diagnostics: string[] = [];
    const client = new SelfHealingPGliteClient(first, {
      openInstance: () => Promise.reject(new Error("idb unavailable")),
      onDiagnostic: (message) => diagnostics.push(message),
    });

    const recreated = await client.recreate("portal stuck");

    expect(recreated).toBe(false);
    expect(client.current).toBe(first);
    expect(first.closed).toBe(false);
    expect(client.recreateCount).toBe(0);
    expect(diagnostics.join(" ")).toContain("replacement");
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
});
