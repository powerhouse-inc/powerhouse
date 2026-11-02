import {
  ThreadedPGlite,
  type PGliteAbortListener,
  type PGliteExitListener,
  type PGliteLike,
} from "@powerhousedao/reactor-api/pglite-node";
import type { ILogger } from "document-model";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { installFatalErrorShutdown } from "../src/fatal-shutdown.mjs";
import {
  createPgliteStoreFactory,
  openStoresTogether,
  READ_STORE,
  REACTOR_STORE,
  routePgliteWorkerFailures,
  terminateOnPoisoned,
  type PgliteStoreOptions,
  vacuumFullTimingFromEnv,
} from "../src/pglite-store.mjs";

const BOOT = 90_000;

function stubLogger() {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

/** A process stand-in with the fatal shutdown installed; `kill` records it. */
function fatalProcess() {
  const proc = Object.assign(new EventEmitter(), {
    pid: 4321,
    exitCode: undefined as number | undefined,
    kill: vi.fn(() => true),
    exit: vi.fn(),
  });
  installFatalErrorShutdown(stubLogger() as unknown as ILogger, proc as never);
  return proc;
}

class FakeWorkerEvents {
  abort: PGliteAbortListener = () => undefined;
  exit: PGliteExitListener = () => undefined;
  onAbort(listener: PGliteAbortListener): () => void {
    this.abort = listener;
    return () => undefined;
  }
  onExit(listener: PGliteExitListener): () => void {
    this.exit = listener;
    return () => undefined;
  }
}

describe("routePgliteWorkerFailures", () => {
  it("sends an abort to the fatal shutdown", () => {
    const proc = fatalProcess();
    const events = new FakeWorkerEvents();
    routePgliteWorkerFailures(
      events,
      stubLogger() as unknown as ILogger,
      proc as never,
    );
    events.abort("PGlite aborted: disk full");
    expect(proc.kill).toHaveBeenCalledWith(4321, "SIGTERM");
    expect(proc.exitCode).toBe(1);
  });

  it("sends an unexpected exit to the fatal shutdown, but not a clean close", () => {
    const proc = fatalProcess();
    const events = new FakeWorkerEvents();
    routePgliteWorkerFailures(
      events,
      stubLogger() as unknown as ILogger,
      proc as never,
    );
    events.exit(null);
    expect(proc.kill).not.toHaveBeenCalled();
    events.exit(new Error("worker exited with code 1"));
    expect(proc.kill).toHaveBeenCalledWith(4321, "SIGTERM");
  });

  it("logs when no fatal shutdown is installed", () => {
    const logger = stubLogger();
    const events = new FakeWorkerEvents();
    routePgliteWorkerFailures(events, logger as unknown as ILogger);
    events.exit(new Error("gone"));
    expect(logger.error).toHaveBeenCalledWith(
      "PGlite worker exited: @error",
      expect.any(Error),
    );
  });
});

describe("terminateOnPoisoned", () => {
  it("reports the poisoning, then stops the store's worker", () => {
    const calls: string[] = [];
    const options = terminateOnPoisoned(
      { onPoisoned: () => calls.push("reported"), statementTimeoutMs: 5 },
      {
        terminate: () => {
          calls.push("terminated");
          return Promise.resolve();
        },
      },
    );
    expect(options.statementTimeoutMs).toBe(5);
    options.onPoisoned?.(new Error("hung"));
    expect(calls).toEqual(["reported", "terminated"]);
  });
});

describe("createPgliteStoreFactory", () => {
  const open: PGliteLike[] = [];
  let dataDir: string | undefined;

  afterEach(async () => {
    for (const store of open.splice(0)) {
      if (store instanceof ThreadedPGlite) {
        await store.terminate();
      } else if (!store.closed) {
        await store.close();
      }
    }
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  function options(
    overrides: Partial<PgliteStoreOptions>,
  ): PgliteStoreOptions & { logger: ReturnType<typeof stubLogger> } {
    const logger = stubLogger();
    return {
      label: "read-storage",
      major: 17,
      parsers: "utc-timestamps",
      inMemory: true,
      threaded: false,
      ...overrides,
      logger: logger as unknown as ILogger,
    } as PgliteStoreOptions & { logger: ReturnType<typeof stubLogger> };
  }

  async function utcTimestamp(store: PGliteLike): Promise<string> {
    const { rows } = await store.query<{ at: Date }>(
      "select '2024-01-02 03:04:05'::timestamp as at",
    );
    return rows[0].at.toISOString();
  }

  it(
    "opens the store in the main thread when not threaded",
    async () => {
      const opts = options({ threaded: false });
      const store = (await createPgliteStoreFactory(opts))("unused");
      open.push(store);
      expect(store).not.toBeInstanceOf(ThreadedPGlite);
      expect(await utcTimestamp(store)).toBe("2024-01-02T03:04:05.000Z");
      expect(opts.logger.info).toHaveBeenCalledWith(
        "read-storage: PGlite (PG17) in the main thread, in memory [PH_PGLITE_IN_MEMORY=1]",
      );
    },
    BOOT,
  );

  it(
    "opens the store in a worker thread when threaded",
    async () => {
      const opts = options({ threaded: true });
      const store = (await createPgliteStoreFactory(opts))("unused");
      open.push(store);
      expect(store).toBeInstanceOf(ThreadedPGlite);
      expect(await utcTimestamp(store)).toBe("2024-01-02T03:04:05.000Z");
      expect(opts.logger.info).toHaveBeenCalledWith(
        "read-storage: PGlite (PG17) in a worker thread (memory limit 1024 MB), in memory [PH_PGLITE_IN_MEMORY=1]",
      );
    },
    BOOT,
  );

  it(
    "takes the fatal shutdown when a store's worker dies",
    async () => {
      const proc = fatalProcess();
      const opts = options({ threaded: true, proc: proc as never });
      const store = (await createPgliteStoreFactory(opts))("unused");
      open.push(store);
      await store.waitReady;
      await (store as ThreadedPGlite).terminate();
      await vi.waitFor(() =>
        expect(proc.kill).toHaveBeenCalledWith(4321, "SIGTERM"),
      );
    },
    BOOT,
  );

  it(
    "writes a durable store in a worker that the main thread reads back",
    async () => {
      dataDir = await mkdtemp(join(tmpdir(), "sb-pglite-store-"));
      const dir = join(dataDir, "read-storage");
      const threaded = (
        await createPgliteStoreFactory(
          options({ threaded: true, inMemory: false, parsers: "none" }),
        )
      )(dir);
      await threaded.exec("create table kept (v text)");
      await threaded.query("insert into kept values ($1)", ["from-worker"]);
      await threaded.close();

      const mainThread = (
        await createPgliteStoreFactory(
          options({ threaded: false, inMemory: false, parsers: "none" }),
        )
      )(dir);
      open.push(mainThread);
      const { rows } = await mainThread.query<{ v: string }>(
        "select v from kept",
      );
      expect(rows).toEqual([{ v: "from-worker" }]);
      await mainThread.close();
    },
    BOOT * 2,
  );
});

describe("openStoresTogether", () => {
  function fakeStore(waitReady: Promise<void> = Promise.resolve()) {
    return {
      waitReady,
      close: vi.fn(() => Promise.resolve()),
    } as unknown as Omit<PGliteLike, "close"> & {
      close: Mock<() => Promise<void>>;
    };
  }

  function failing(error: Error): Promise<void> {
    const opening = Promise.reject(error);
    opening.catch(() => undefined);
    return opening;
  }

  it("leaves both open when both open", async () => {
    const reactor = fakeStore();
    const readModel = fakeStore();
    const settled = vi.fn();
    const stores = openStoresTogether(
      () => reactor,
      () => readModel,
    );
    stores.failed.then(settled, settled);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(stores.reactor).toBe(reactor);
    expect(stores.readModel).toBe(readModel);
    expect(settled).not.toHaveBeenCalled();
    expect(reactor.close).not.toHaveBeenCalled();
    expect(readModel.close).not.toHaveBeenCalled();
  });

  it.each([
    ["reactor", "readModel"],
    ["readModel", "reactor"],
  ] as const)("%s failing closes %s, with the failure", async (bad, good) => {
    const error = new Error("the disk is full");
    const fakes = {
      reactor: fakeStore(bad === "reactor" ? failing(error) : undefined),
      readModel: fakeStore(bad === "readModel" ? failing(error) : undefined),
    };
    const stores = openStoresTogether(
      () => fakes.reactor,
      () => fakes.readModel,
    );
    await expect(stores.failed).rejects.toBe(error);
    expect(fakes[good].close).toHaveBeenCalled();
  });

  it("reports the failure only once the survivor has closed", async () => {
    let closed!: () => void;
    const survivor = fakeStore();
    survivor.close.mockReturnValue(
      new Promise((resolve) => (closed = resolve)),
    );
    const stores = openStoresTogether(
      () => fakeStore(failing(new Error("no"))),
      () => survivor,
    );
    const settled = vi.fn();
    stores.failed.catch(settled);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).not.toHaveBeenCalled();
    closed();
    await vi.waitFor(() => expect(settled).toHaveBeenCalled());
  });

  it("still reports the failure when the survivor won't close", async () => {
    const error = new Error("no");
    const survivor = fakeStore();
    survivor.close.mockRejectedValue(new Error("won't"));
    const stores = openStoresTogether(
      () => survivor,
      () => fakeStore(failing(error)),
    );
    await expect(stores.failed).rejects.toBe(error);
  });

  it("closes the reactor store if the read store can't start", () => {
    const reactor = fakeStore();
    const error = new Error("no worker");
    expect(() =>
      openStoresTogether(
        () => reactor,
        () => {
          throw error;
        },
      ),
    ).toThrow(error);
    expect(reactor.close).toHaveBeenCalled();
  });

  it("closes both for a boot that failed elsewhere", async () => {
    const reactor = fakeStore();
    const readModel = fakeStore();
    await openStoresTogether(
      () => reactor,
      () => readModel,
    ).close();
    expect(reactor.close).toHaveBeenCalled();
    expect(readModel.close).toHaveBeenCalled();
  });

  describe("on real stores", () => {
    let root: string;
    const logger = stubLogger() as unknown as ILogger;
    const opener = async (store: typeof READ_STORE | typeof REACTOR_STORE) => {
      const open = await createPgliteStoreFactory({
        ...store,
        major: 17,
        inMemory: false,
        threaded: true,
        logger,
      });
      return open;
    };

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it(
      "opens both, each in a thread of its own",
      async () => {
        root = await mkdtemp(join(tmpdir(), "sb-stores-"));
        const openReactor = await opener(REACTOR_STORE);
        const openRead = await opener(READ_STORE);
        const stores = openStoresTogether(
          () => openReactor(join(root, "reactor-storage")),
          () => openRead(join(root, "read-storage")),
        );
        await Promise.all([
          stores.reactor.waitReady,
          stores.readModel.waitReady,
        ]);
        expect((stores.reactor as ThreadedPGlite).threadId).not.toBe(
          (stores.readModel as ThreadedPGlite).threadId,
        );
        await stores.reactor.exec("create table kept (v text)");
        await stores.readModel.query("select 1");
        await stores.close();
        expect(stores.reactor.closed).toBe(true);
        expect(stores.readModel.closed).toBe(true);
      },
      BOOT * 2,
    );

    it(
      "closes a store that's still opening when the other can't, and it opens again",
      async () => {
        root = await mkdtemp(join(tmpdir(), "sb-stores-"));
        const notAStore = join(root, "read-storage");
        await writeFile(notAStore, "a file where a store should be");
        const reactorDir = join(root, "reactor-storage");
        const openReactor = await opener(REACTOR_STORE);
        const openRead = await opener(READ_STORE);
        const stores = openStoresTogether(
          () => openReactor(reactorDir),
          () => openRead(notAStore),
        );
        await expect(stores.failed).rejects.toThrow();
        expect(stores.reactor.closed).toBe(true);

        const again = openReactor(reactorDir);
        await again.waitReady;
        await again.query("select 1");
        await again.close();
      },
      BOOT * 2,
    );
  });
});

describe("vacuumFullTimingFromEnv", () => {
  it("reads both timings, and leaves unset or invalid values to the defaults", () => {
    expect(
      vacuumFullTimingFromEnv({
        PH_PGLITE_VACUUM_FULL: "quiet",
        PH_PGLITE_VACUUM_FULL_QUIET_MS: "0",
        PH_PGLITE_VACUUM_FULL_MAX_DEFER_MS: "600000",
      }),
    ).toEqual({ vacuumFullQuietMs: 0, vacuumFullMaxDeferMs: 600_000 });
    expect(vacuumFullTimingFromEnv({})).toEqual({ vacuumFullAboveBytes: 0 });
    expect(
      vacuumFullTimingFromEnv({
        PH_PGLITE_VACUUM_FULL: "quiet",
        PH_PGLITE_VACUUM_FULL_QUIET_MS: "soon",
        PH_PGLITE_VACUUM_FULL_MAX_DEFER_MS: "-5",
      }),
    ).toEqual({});
  });

  it("turns the mode into the settings the stores open with", () => {
    expect(vacuumFullTimingFromEnv({ PH_PGLITE_VACUUM_FULL: "off" })).toEqual({
      vacuumFullAboveBytes: 0,
    });
    expect(
      vacuumFullTimingFromEnv({ PH_PGLITE_VACUUM_FULL: "forced" }),
    ).toEqual({ vacuumFullMaxDeferMs: 1_800_000 });
    expect(() =>
      vacuumFullTimingFromEnv({ PH_PGLITE_VACUUM_FULL: "sometimes" }),
    ).toThrow(/PH_PGLITE_VACUUM_FULL/);
  });
});
