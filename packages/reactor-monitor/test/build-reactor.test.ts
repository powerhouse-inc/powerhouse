import {
  IN_MEMORY_PGLITE_STORAGE_FACTS,
  PGLITE_IDB_STORAGE_FACTS,
} from "@powerhousedao/reactor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMonitorReactor, type BuiltReactor } from "../src/index.js";
import type * as Store from "../src/store.js";

// Node has no IndexedDB; idb opens a memory PGlite so group commit runs for real.
vi.mock("../src/store.js", async (importOriginal) => {
  const original = await importOriginal<typeof Store>();
  return {
    ...original,
    openReactorStore: (
      namespace: string,
      storage?: Parameters<typeof original.openReactorStore>[1],
    ) =>
      original.openReactorStore(
        namespace,
        storage?.kind === "idb" ? { kind: "memory" } : storage,
      ),
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
    for (const reactor of built.splice(0)) {
      await reactor.shutdown();
    }
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
});
