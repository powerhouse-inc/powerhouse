// Workflow execution is a singleton (multi-reactor plan, agreed decision 3).
// The claim is what enforces it: a second live process over one run journal is
// refused by name rather than left to fail the first one's runs.
import { sql } from "kysely";
import { describe, expect, it, vi } from "vitest";
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import {
  acquireWorkflowSingletonLease,
  SINGLETON_HEARTBEAT_MS,
  SINGLETON_STALE_HEARTBEATS,
  singletonOwnerName,
  WORKFLOW_SINGLETON_OWNER_ENV,
  WorkflowSingletonConflictError,
} from "./singleton-lease.js";

const silent = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  verbose: () => undefined,
  child: () => silent,
} as never;

interface LeaseTable {
  workflow_singleton: {
    owner: string;
    heartbeat_at: Date;
    expires_at: Date;
    acquired_at: Date;
  };
}

function leaseTable(relationalDb: IRelationalDb) {
  return relationalDb.createNamespace<LeaseTable>(
    "workflow_runtime",
  ) as Promise<IRelationalDb<LeaseTable>>;
}

function fixture() {
  const relationalDb = createFreshRelationalDb();
  return {
    relationalDb,
    // The lease reads the database's clock, so time passes by moving the row.
    age: async (ms: number) => {
      const db = await leaseTable(relationalDb);
      await db
        .updateTable("workflow_singleton")
        .set({
          acquired_at: sql<Date>`acquired_at - ${ms} * interval '1 millisecond'`,
          heartbeat_at: sql<Date>`heartbeat_at - ${ms} * interval '1 millisecond'`,
          expires_at: sql<Date>`expires_at - ${ms} * interval '1 millisecond'`,
        })
        .execute();
    },
    acquire: (owner: string, ttlMs = 60_000, onLost?: () => void) =>
      acquireWorkflowSingletonLease({
        relationalDb,
        logger: silent,
        owner,
        ttlMs,
        onLost,
      }),
  };
}

describe("the workflow singleton lease", () => {
  it("lets the first process claim it", async () => {
    const { acquire } = fixture();
    const lease = await acquire("alpha");
    expect(lease.owner).toBe("alpha");
    await lease.release();
  });

  it("refuses a second live process, naming the holder", async () => {
    const { acquire } = fixture();
    await acquire("alpha");

    const refused = await acquire("beta").catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(WorkflowSingletonConflictError);
    const conflict = refused as WorkflowSingletonConflictError;
    expect(conflict.owner).toBe("alpha");
    expect(conflict.wouldBe).toBe("beta");
    expect(conflict.message).toContain(WORKFLOW_SINGLETON_OWNER_ENV);
  });

  // A rolling deploy under one stable owner name: the new pod must not open
  // the journal while the old one is still running workflows on it.
  it("refuses its own owner name while the holder is still renewing", async () => {
    const { acquire, age } = fixture();
    await acquire("switchboard-0");
    await age(SINGLETON_HEARTBEAT_MS);

    await expect(acquire("switchboard-0")).rejects.toBeInstanceOf(
      WorkflowSingletonConflictError,
    );
  });

  it("re-claims its own owner name once the holder's heartbeat is stale", async () => {
    const { acquire, age } = fixture();
    await acquire("switchboard-0");
    await age(SINGLETON_HEARTBEAT_MS * SINGLETON_STALE_HEARTBEATS + 1);

    const again = await acquire("switchboard-0");

    expect(await again.heartbeat()).toBe(true);
    // Stale is ours to take over, not anyone's: the lease has not expired.
    await expect(acquire("someone-else")).rejects.toBeInstanceOf(
      WorkflowSingletonConflictError,
    );
  });

  it("lets another process take over once the lease has expired", async () => {
    const { acquire, age } = fixture();
    await acquire("alpha", 1_000);
    await age(1_001);

    const taken = await acquire("beta", 1_000);

    expect(taken.owner).toBe("beta");
  });

  it("renews from the moment it is claimed, before any host start", async () => {
    const { relationalDb, age } = fixture();
    // Periods long enough that a busy test machine never trips the
    // self-fence (heartbeat 500ms puts it at 750ms of silence).
    const ttlMs = 10_000;
    const lease = await acquireWorkflowSingletonLease({
      relationalDb,
      logger: silent,
      owner: "alpha",
      ttlMs,
      heartbeatMs: 500,
    });
    try {
      const db = await leaseTable(relationalDb);
      // Already expired: only a renewal can make it live again.
      await age(ttlMs + 1_000);
      const aged = await db
        .selectFrom("workflow_singleton")
        .select("expires_at")
        .executeTakeFirstOrThrow();
      await vi.waitFor(
        async () => {
          const row = await db
            .selectFrom("workflow_singleton")
            .select("expires_at")
            .executeTakeFirstOrThrow();
          expect(new Date(row.expires_at).getTime()).toBeGreaterThan(
            new Date(aged.expires_at).getTime() + ttlMs / 2,
          );
        },
        { timeout: 3_000 },
      );

      await expect(
        acquireWorkflowSingletonLease({
          relationalDb,
          logger: silent,
          owner: "beta",
          ttlMs,
        }),
      ).rejects.toBeInstanceOf(WorkflowSingletonConflictError);
    } finally {
      await lease.release();
    }
  });

  it("claims beside the table an unreleased branch build left behind", async () => {
    const { relationalDb, acquire } = fixture();
    const db = await relationalDb.createNamespace<{
      singleton_lease: Record<string, string>;
    }>("workflow_runtime");
    await db.schema
      .createTable("singleton_lease")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("owner", "text", (col) => col.notNull())
      .addColumn("acquired_at", "text", (col) => col.notNull())
      .addColumn("heartbeat_at", "text", (col) => col.notNull())
      .addColumn("expires_at", "text", (col) => col.notNull())
      .execute();
    await db
      .insertInto("singleton_lease")
      .values({
        id: "workflow-runtime",
        owner: "old-build",
        acquired_at: "2026-10-04T00:00:00.000Z",
        heartbeat_at: "2026-10-04T00:00:00.000Z",
        expires_at: "2099-01-01T00:00:00.000Z",
      })
      .execute();

    const lease = await acquire("alpha");

    expect(await lease.heartbeat()).toBe(true);
  });

  it("frees the claim on release", async () => {
    const { acquire } = fixture();
    const lease = await acquire("alpha");
    await lease.release();

    const next = await acquire("beta");

    expect(next.owner).toBe("beta");
  });

  it("reports a heartbeat that finds the lease taken", async () => {
    const { acquire, age } = fixture();
    const first = await acquire("alpha", 1_000);
    expect(await first.heartbeat()).toBe(true);

    await age(1_001);
    await acquire("beta", 1_000);

    // The takeover is what a second writer has to learn from; the heartbeat is
    // the only place it can.
    expect(await first.heartbeat()).toBe(false);
  });

  // A random per-process owner name meant an unclean kill left a lease nobody
  // could re-claim: the next boot of the same slot waited out the whole TTL,
  // and (before the API degraded) crash-looped the host while it did.
  it("names the slot the same way on every boot, so a restart re-claims at once", () => {
    const storage = "/srv/switchboard/.ph/read-storage";

    const name = singletonOwnerName({}, storage);

    expect(singletonOwnerName({}, storage)).toBe(name);
    // Not the pid, and not a random suffix.
    expect(name).not.toContain(String(process.pid));
    // A different journal is a different owner, hostname or not.
    expect(singletonOwnerName({}, "/srv/other/.ph/read-storage")).not.toBe(
      name,
    );
    // Both halves are there, and the journal's half is hashed: a Postgres URL
    // with credentials must not reach the lease row or a log line.
    const withUrl = singletonOwnerName(
      {},
      "postgres://user:secret@db.internal:5432/switchboard",
    );
    expect(withUrl).toContain("/");
    expect(withUrl).not.toContain("secret");
    expect(withUrl).not.toContain("db.internal");
    // And the env still overrides everything.
    expect(
      singletonOwnerName(
        { [WORKFLOW_SINGLETON_OWNER_ENV]: " slot-a " },
        storage,
      ),
    ).toBe("slot-a");
  });

  it("re-claims its own unreleased lease without waiting out the TTL", async () => {
    const { relationalDb, age } = fixture();
    const storage = "/srv/switchboard/.ph/read-storage";
    const owner = singletonOwnerName({}, storage);
    // A killed process: the lease is still live and was never released.
    await acquireWorkflowSingletonLease({
      relationalDb,
      logger: silent,
      storageId: storage,
    });

    // The restart, under the same stable name, inside the TTL.
    await age(SINGLETON_HEARTBEAT_MS * SINGLETON_STALE_HEARTBEATS + 1);
    const rebooted = await acquireWorkflowSingletonLease({
      relationalDb,
      logger: silent,
      storageId: storage,
    });

    expect(rebooted.owner).toBe(owner);
    expect(await rebooted.heartbeat()).toBe(true);
  });
});

// A rolling deploy under a stable PH_WORKFLOWS_SINGLETON_OWNER: the old pod and
// the new one share the owner name, so only the per-claim instance tells them
// apart.
describe("two processes under one owner name", () => {
  const takeovers = [
    ["after the old lease expired", 60_001],
    [
      "after the old heartbeat went stale",
      SINGLETON_HEARTBEAT_MS * SINGLETON_STALE_HEARTBEATS + 1,
    ],
  ] as const;

  it.each(takeovers)(
    "keeps the new process's lease when the old one releases %s",
    async (_, wait) => {
      const { acquire, age } = fixture();
      const oldPod = await acquire("switchboard-0");
      await age(wait);
      const newPod = await acquire("switchboard-0");

      await oldPod.release();

      expect(await newPod.heartbeat()).toBe(true);
      await expect(acquire("someone-else")).rejects.toBeInstanceOf(
        WorkflowSingletonConflictError,
      );
    },
  );

  it.each(takeovers)(
    "tells the old process it lost the lease %s, without renewing it",
    async (_, wait) => {
      const { acquire, age } = fixture();
      const lost = vi.fn();
      const oldPod = await acquire("switchboard-0", 60_000, lost);
      await age(wait);
      const newPod = await acquire("switchboard-0");

      expect(await oldPod.heartbeat()).toBe(false);
      expect(await oldPod.heartbeat()).toBe(false);
      expect(lost).toHaveBeenCalledTimes(1);
      expect(await newPod.heartbeat()).toBe(true);
    },
  );
});

type UpdateFault = (run: () => Promise<unknown>) => Promise<unknown>;

// The lease's namespace, with every UPDATE (the renewal) routed through a
// fault: a database that errors, hangs, or answers late.
function withUpdateFault(
  relationalDb: IRelationalDb,
  fault: () => UpdateFault | undefined,
): IRelationalDb {
  const wrapBuilder = (builder: object): object =>
    new Proxy(builder, {
      get(target, prop) {
        const value = Reflect.get(target, prop) as unknown;
        if (typeof value !== "function") return value;
        if (prop === "executeTakeFirst" || prop === "execute") {
          return (...args: unknown[]) => {
            const run = () =>
              (value as (...a: unknown[]) => Promise<unknown>).apply(
                target,
                args,
              );
            const active = fault();
            return active ? active(run) : run();
          };
        }
        return (...args: unknown[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(
            target,
            args,
          );
          return typeof result === "object" && result !== null
            ? wrapBuilder(result)
            : result;
        };
      },
    });
  return new Proxy(relationalDb, {
    get(target, prop) {
      if (prop === "createNamespace") {
        return async (name: string) => {
          const db = await target.createNamespace(name);
          return new Proxy(db, {
            get(inner, key) {
              const value = Reflect.get(inner, key) as unknown;
              if (key === "updateTable" && typeof value === "function") {
                return (...args: unknown[]) =>
                  wrapBuilder(
                    (value as (...a: unknown[]) => object).apply(inner, args),
                  );
              }
              return typeof value === "function"
                ? (value as (...a: unknown[]) => unknown).bind(inner)
                : value;
            },
          });
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === "function"
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

// The journal's writes are best-effort, so a holder that cannot renew keeps
// running workflows unless it stops itself before anyone may take over.
describe("a holder that cannot renew", () => {
  const faults: [string, UpdateFault][] = [
    [
      "errors",
      () => Promise.reject(new Error("connection terminated unexpectedly")),
    ],
    ["hangs", () => new Promise(() => undefined)],
  ];

  it.each(faults)(
    "reports itself lost before the lease can be taken when the database %s",
    async (_, failure) => {
      const relationalDb = createFreshRelationalDb();
      let broken = false;
      const lost = vi.fn();
      // Heartbeat 500ms: the fence at 750ms of silence, stale at 1s.
      const ttlMs = 5_000;
      const heartbeatMs = 500;
      const lease = await acquireWorkflowSingletonLease({
        relationalDb: withUpdateFault(relationalDb, () =>
          broken ? failure : undefined,
        ),
        logger: silent,
        owner: "alpha",
        ttlMs,
        heartbeatMs,
        onLost: lost,
      });
      try {
        // Renewing normally, it holds on for several renewal periods.
        await new Promise((resolve) => setTimeout(resolve, heartbeatMs * 4));
        expect(lost).not.toHaveBeenCalled();

        broken = true;
        const brokeAt = Date.now();
        await vi.waitFor(() => expect(lost).toHaveBeenCalledTimes(1), {
          timeout: ttlMs,
        });
        // Before a stale same-owner claim could take it over.
        expect(Date.now() - brokeAt).toBeLessThan(
          heartbeatMs * SINGLETON_STALE_HEARTBEATS,
        );
        expect(lost).toHaveBeenCalledWith(undefined);
      } finally {
        broken = false;
        await lease.release();
      }
    },
  );
});

describe("releasing while a renewal is in flight", () => {
  it("is not reported as a lost lease", async () => {
    const relationalDb = createFreshRelationalDb();
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    let gated = false;
    const lost = vi.fn();
    const lease = await acquireWorkflowSingletonLease({
      relationalDb: withUpdateFault(relationalDb, () =>
        gated ? (run) => gate.then(run) : undefined,
      ),
      logger: silent,
      owner: "alpha",
      onLost: lost,
    });
    gated = true;

    const renewing = lease.heartbeat();
    const releasing = lease.release();
    setTimeout(open, 20);
    await Promise.all([renewing, releasing]);

    expect(lost).not.toHaveBeenCalled();
    // And the release went through: the lease is free.
    const next = await acquireWorkflowSingletonLease({
      relationalDb,
      logger: silent,
      owner: "beta",
    });
    await next.release();
  });
});

// Two hosts booting on a fresh Postgres both run CREATE … IF NOT EXISTS, and
// the loser can still hit the catalog's unique index.
describe("creating the lease table beside another host", () => {
  it.each(["23505", "42P07"])(
    "retries once when the DDL races (%s)",
    async (code) => {
      const relationalDb = createFreshRelationalDb();
      let raced = false;
      const racing = new Proxy(relationalDb, {
        get(target, prop) {
          if (prop === "createNamespace") {
            return (name: string) => {
              if (!raced) {
                raced = true;
                return Promise.reject(
                  Object.assign(new Error("duplicate key value"), { code }),
                );
              }
              return target.createNamespace(name);
            };
          }
          const value = Reflect.get(target, prop) as unknown;
          return typeof value === "function"
            ? (value as (...a: unknown[]) => unknown).bind(target)
            : value;
        },
      });

      const lease = await acquireWorkflowSingletonLease({
        relationalDb: racing,
        logger: silent,
        owner: "alpha",
      });

      expect(await lease.heartbeat()).toBe(true);
      await lease.release();
    },
  );
});
