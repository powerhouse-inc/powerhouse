import {
  IN_MEMORY_PGLITE_STORAGE_FACTS,
  PGLITE_IDB_STORAGE_FACTS,
  PGliteSessionPoisonedError,
} from "@powerhousedao/reactor";
import { sql } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMonitorReactor, type BuiltReactor } from "../src/index.js";
import { createStoreLocks } from "../src/store-lock.js";
import type * as Store from "../src/store.js";

const opens = vi.hoisted(() => [] as string[]);

// Node has no IndexedDB; idb opens a memory PGlite so group commit runs for real.
vi.mock("../src/store.js", async (importOriginal) => {
  const original = await importOriginal<typeof Store>();
  return {
    ...original,
    openReactorStore: (
      namespace: string,
      storage?: Parameters<typeof original.openReactorStore>[1],
    ) => {
      opens.push(namespace);
      return original.openReactorStore(
        namespace,
        storage?.kind === "idb" ? { kind: "memory" } : storage,
      );
    },
  };
});

describe("buildMonitorReactor", () => {
  const built: BuiltReactor[] = [];

  async function build(
    storage: "memory" | "idb",
    name: string,
  ): Promise<BuiltReactor> {
    const reactor = await buildMonitorReactor({
      namespace: `build-${name}`,
      storage: { kind: storage },
    });
    built.push(reactor);
    return reactor;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const reactor of built.splice(0)) {
      await reactor.shutdown();
    }
  });

  it("reports a poisoned memory store unhealthy and unrecoverable", async () => {
    const unrecoverable: Error[] = [];
    const reactor = await buildMonitorReactor({
      namespace: "build-poisoned-memory",
      storage: { kind: "memory" },
      onUnrecoverable: (cause) => unrecoverable.push(cause),
    });
    built.push(reactor);
    const database = reactor.module.reactorModule!.database;
    // A rollback the session cannot run leaves it poisoned.
    const { pg } = reactor;
    const query = pg.query.bind(pg);
    const exec = pg.exec.bind(pg);
    const refuse = (text: string) => /^\s*rollback/i.test(text);
    vi.spyOn(pg, "query").mockImplementation((text, params) =>
      refuse(text)
        ? Promise.reject(new Error('cannot drop active portal ""'))
        : query(text, params),
    );
    vi.spyOn(pg, "exec").mockImplementation((text) =>
      refuse(text)
        ? Promise.reject(new Error('cannot drop active portal ""'))
        : exec(text),
    );

    await database
      .transaction()
      .execute(async (trx) => {
        await sql`select 1`.execute(trx);
        throw new Error("job failed");
      })
      .catch(() => undefined);
    await expect(sql`select 1`.execute(database)).rejects.toThrow(
      PGliteSessionPoisonedError,
    );

    expect(unrecoverable).toHaveLength(1);
    expect(unrecoverable[0].message).toContain("cannot drop active portal");
    expect((await reactor.inspector.getStorageHealth()).healthy).toBe(false);
  });

  it("hands the inspector the memory store's own health source", async () => {
    const reactor = await build("memory", "health-memory");

    expect(await reactor.inspector.getStorageHealth()).toEqual({
      tracked: true,
      healthy: true,
      everRecreated: false,
      recreateCount: 0,
    });
  });

  it("reports the group-commit store's health for idb", async () => {
    const reactor = await build("idb", "health-idb");

    const health = await reactor.inspector.getStorageHealth();
    expect(health.tracked).toBe(true);
    expect(health.healthy).toBe(true);
  });

  it("reports memory storage facts and admin and sql access", async () => {
    const reactor = await build("memory", "info-memory");

    const info = await reactor.inspector.info();
    expect(info.storage).toEqual(IN_MEMORY_PGLITE_STORAGE_FACTS);
    expect(info.access).toEqual({ admin: true, sql: true });
  });

  it("reports idb storage facts", async () => {
    const reactor = await build("idb", "info-idb");

    const info = await reactor.inspector.info();
    expect(info.storage).toEqual(PGLITE_IDB_STORAGE_FACTS);
    expect(info.access).toEqual({ admin: true, sql: true });
  });

  it("closes the store on shutdown", async () => {
    const reactor = await buildMonitorReactor({
      namespace: "build-close",
      storage: { kind: "idb" },
    });

    await reactor.shutdown();

    expect(reactor.pg.closed).toBe(true);
    await expect(reactor.dbQuery.queryDb("select 1")).rejects.toThrow();
  });

  it("closes the store even when the reactor's stop hangs", async () => {
    const reactor = await buildMonitorReactor({
      namespace: "build-hung-stop",
      storage: { kind: "idb" },
      stopTimeoutMs: 50,
    });
    vi.spyOn(reactor.module.reactor, "kill").mockReturnValue({
      completed: new Promise<void>(() => undefined),
    } as ReturnType<typeof reactor.module.reactor.kill>);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await reactor.shutdown();

    expect(reactor.pg.closed).toBe(true);
    error.mockRestore();
  }, 5_000);

  it("opens a locked store only after the holder closed it", async () => {
    const options = {
      namespace: "build-locked",
      storage: { kind: "idb" },
    } as const;
    const holder = await buildMonitorReactor({
      ...options,
      storeLocks: createStoreLocks(navigator.locks),
    });

    const next = buildMonitorReactor({
      ...options,
      storeLocks: createStoreLocks(navigator.locks),
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(opens.filter((name) => name === options.namespace)).toHaveLength(1);

    await holder.shutdown();
    const reactor = await next;
    built.push(reactor);
    expect(opens.filter((name) => name === options.namespace)).toHaveLength(2);
    expect(holder.pg.closed).toBe(true);
  });

  it("keeps a store's lock when its close fails", async () => {
    const storeLocks = {
      acquire: vi.fn(() => Promise.resolve()),
      release: vi.fn(),
      keep: vi.fn(),
    };
    const reactor = await buildMonitorReactor({
      namespace: "build-close-fails",
      storage: { kind: "idb" },
      storeLocks,
    });
    vi.spyOn(
      reactor.module.reactorModule!.groupCommitStorage!,
      "close",
    ).mockRejectedValue(new Error("close refused"));
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await reactor.shutdown();

    expect(storeLocks.release).not.toHaveBeenCalled();
    expect(storeLocks.keep).toHaveBeenCalledWith("build-close-fails");
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/build-close-fails stays held/),
    );
    error.mockRestore();
    await reactor.pg.close();
  });

  it("refuses this realm a namespace kept after a failed close", async () => {
    const locks = createStoreLocks({
      request: ((_name: string, _options: unknown, grant: () => unknown) =>
        Promise.resolve(grant())) as LockManager["request"],
    });
    await locks.acquire("kept");

    locks.keep("kept");

    await expect(locks.acquire("kept")).rejects.toThrow(/kept.*stays held/);
  });
});
