import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { InMemoryQueue } from "@powerhousedao/reactor";
import {
  type Database,
  type InProcessReactorModule,
  type IReactorClient,
  JobStatus,
  ReactorBuilder,
} from "@powerhousedao/reactor";
import { ReactorHost } from "@powerhousedao/reactor-browser/rpc";
import {
  type DocumentModelModule,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeWithin } from "./close-within.js";
import { createStoreLocks } from "./store-lock.js";
import { createWorkerStores } from "./worker-stores.js";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const undo of cleanup.splice(0)) undo();
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => (resolve = res));
  return { promise, resolve };
}

// Like PGlite: a second close while the first is running throws.
function fakeStore(closing: Promise<void> = Promise.resolve()) {
  let started = false;
  return {
    close: async () => {
      if (started) throw new Error("PGlite is closing");
      started = true;
      await closing;
    },
  };
}

let seq = 0;

type Retirement = {
  isRetired: () => boolean;
  retireWorker: (reason: string) => void;
};

type Reactor = {
  stopReactor?: () => Promise<void>;
  stopSync?: () => void;
  queue?: Parameters<typeof createWorkerStores>[0]["queue"];
  drainMs?: number;
};

async function setup(
  relationalClose?: Promise<void>,
  host?: Retirement,
  reactor: Reactor = {},
  reactorClose?: Promise<void>,
) {
  seq += 1;
  const names = { relational: `rel-${seq}`, reactor: `reactor-${seq}` };
  const locks = createStoreLocks(navigator.locks);
  await locks.acquire(names.relational);
  await locks.acquire(names.reactor);
  cleanup.push(() => {
    locks.release(names.relational);
    locks.release(names.reactor);
  });
  const refs: {
    relational?: ReturnType<typeof fakeStore>;
    reactor?: ReturnType<typeof fakeStore>;
  } = {
    relational: fakeStore(relationalClose),
    reactor: fakeStore(reactorClose),
  };
  const log: string[] = [];
  // Stands in for ReactorHost.retireAndReload, which calls `stores.retire`.
  let retired = false;
  const retire = (reason: string): Promise<void> | undefined => {
    if (retired) return undefined;
    retired = true;
    log.push(`retired: ${reason}`);
    return stores.retire();
  };
  const stores = createWorkerStores({
    locks,
    stopReactor: async () => {
      log.push("stop");
      await reactor.stopReactor?.();
    },
    stopSync: () => reactor.stopSync?.(),
    queue: reactor.queue ?? (() => undefined),
    drainMs: reactor.drainMs,
    relational: () => ({ namespace: names.relational, store: refs.relational }),
    reactor: () => ({ namespace: names.reactor, store: refs.reactor }),
    forget: () => {
      refs.relational = undefined;
      refs.reactor = undefined;
    },
    isRetired: host?.isRetired ?? (() => retired),
    retireWorker: host?.retireWorker ?? ((reason) => void retire(reason)),
    close: (store) => closeWithin(store, 50),
  });
  return { names, refs, log, stores, retire };
}

function otherWorkerAcquires(namespace: string) {
  const other = createStoreLocks(navigator.locks);
  const state = { granted: false };
  void other.acquire(namespace).then(() => (state.granted = true));
  cleanup.push(() => other.release(namespace));
  return state;
}

describe("worker store lifecycle", () => {
  it("does not release the reactor store to a retire that lands mid-migrate", async () => {
    const relationalClose = deferred();
    const { names, stores, retire } = await setup(relationalClose.promise);
    const filesDone = deferred();
    const migrating = stores.runAdmin({
      close: (store) => closeWithin(store, 60_000),
      run: async () => {
        await filesDone.promise;
        return "migration complete";
      },
      failed: "migration failed",
    });
    await tick();

    const retiring = retire("storage session poisoned");
    const next = otherWorkerAcquires(names.reactor);
    await tick();
    expect(next.granted).toBe(false);

    relationalClose.resolve();
    await tick();
    expect(next.granted).toBe(false);

    filesDone.resolve();
    await migrating;
    await retiring;
    await vi.waitFor(() => expect(next.granted).toBe(true));
  });

  it("stops the reactor and drops the store refs before an admin flow closes them", async () => {
    const { refs, log, stores } = await setup();
    await stores.runAdmin({
      close: closeWithin,
      begin: () => log.push("begin"),
      run: () => {
        log.push("files");
        expect(refs).toEqual({ relational: undefined, reactor: undefined });
        return Promise.resolve("storage cleared");
      },
      failed: "clearing storage failed",
    });
    expect(log).toEqual(["begin", "stop", "files", "retired: storage cleared"]);
  });

  it("refuses an admin flow once the worker is retired, before it begins", async () => {
    const { stores, retire } = await setup();
    const retiring = retire("storage session poisoned");
    const begin = vi.fn();
    const run = vi.fn(() => Promise.resolve("storage cleared"));
    await expect(
      stores.runAdmin({ close: closeWithin, begin, run, failed: "failed" }),
    ).rejects.toThrow(/no longer owns/);
    expect(begin).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    await retiring;
  });

  it("refuses a second admin flow queued behind the first", async () => {
    const { stores } = await setup();
    const first = stores.runAdmin({
      close: closeWithin,
      run: () => Promise.resolve("storage cleared"),
      failed: "clearing storage failed",
    });
    const begin = vi.fn();
    const run = vi.fn(() => Promise.resolve("migration complete"));
    await expect(
      stores.runAdmin({ close: closeWithin, begin, run, failed: "failed" }),
    ).rejects.toThrow(/no longer owns/);
    await first;
    expect(begin).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("keeps a hung store's lock across later flows", async () => {
    const { names, stores } = await setup(new Promise(() => undefined));
    await stores.releaseAfterBootFailure();
    await stores.retire();
    const relationalNext = otherWorkerAcquires(names.relational);
    const reactorNext = otherWorkerAcquires(names.reactor);
    await vi.waitFor(() => expect(reactorNext.granted).toBe(true));
    await tick();
    expect(relationalNext.granted).toBe(false);
  });

  it("retires after a failed admin flow, releasing only the stores it closed", async () => {
    const { names, log, stores } = await setup(new Promise(() => undefined));
    await expect(
      stores.runAdmin({
        close: (store) => closeWithin(store, 50),
        run: () => Promise.reject(new Error("clear failed")),
        failed: "clearing storage failed",
      }),
    ).rejects.toThrow("clear failed");
    expect(log).toContain("retired: clearing storage failed");
    const relationalNext = otherWorkerAcquires(names.relational);
    const reactorNext = otherWorkerAcquires(names.reactor);
    await vi.waitFor(() => expect(reactorNext.granted).toBe(true));
    await tick();
    expect(relationalNext.granted).toBe(false);
  });
});

const HELLO = {
  k: "hello",
  version: { appBuildId: "build", rpcProtocolVersion: 1, models: [] },
};

// The worker's wiring (reactor.worker.ts), with `clear` standing in for clearFileData.
async function workerWith(
  clear: () => Promise<void>,
  build: () => Promise<IReactorClient> = () =>
    Promise.resolve({} as IReactorClient),
  reactor?: Reactor,
) {
  const { names, refs, stores } = await setup(
    undefined,
    {
      isRetired: () => host.retired,
      retireWorker: (reason) =>
        host.retireAndReload(reason, crypto.randomUUID()),
    },
    reactor,
  );
  const host: ReactorHost = new ReactorHost({
    build,
    onRetire: () => stores.retire(),
    drainBeforeReload: () => stores.drain(),
    onSyncOp: () => Promise.reject(new Error("SyncManager not available")),
    onAdminRestart: () =>
      host.retireAndReload("admin restart", crypto.randomUUID()),
    onAdminClearStorage: () =>
      stores.runAdmin({
        close: closeWithin,
        run: async () => {
          await clear();
          return "storage cleared";
        },
        failed: "clearing storage failed",
      }),
  });
  return { names, refs, host };
}

function tab(host: ReactorHost, onReload?: () => void) {
  const { port1, port2 } = new MessageChannel();
  host.connectPort(port1);
  cleanup.push(() => {
    port1.close();
    port2.close();
  });
  let counter = 0;
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  const reloads: { reason?: string; workerGen?: string }[] = [];
  port2.onmessage = (event: MessageEvent) => {
    const msg = event.data as {
      k: string;
      id?: string;
      value?: unknown;
      error?: { message: string };
      reason?: string;
      workerGen?: string;
    };
    if (msg.k === "reload") {
      reloads.push({ reason: msg.reason, workerGen: msg.workerGen });
      onReload?.();
    } else if (msg.k === "res" && msg.id) {
      pending.get(msg.id)?.resolve(msg.value);
    } else if ((msg.k === "err" || msg.k === "sub-err") && msg.id) {
      pending.get(msg.id)?.reject(new Error(msg.error?.message));
    }
  };
  const send = (msg: Record<string, unknown>): Promise<unknown> => {
    const id = `t${++counter}`;
    const reply = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    port2.postMessage({ ...msg, id });
    return reply;
  };
  return { send, reloads };
}

describe("worker retired during boot", () => {
  it("keeps the lock of a store still opening until the build settles and closes it", async () => {
    let finishBuild = () => undefined as void;
    const built = new Promise<IReactorClient>((resolve) => {
      finishBuild = () => resolve({} as IReactorClient);
    });
    const { names, refs, host } = await workerWith(
      () => Promise.resolve(),
      () => built,
    );
    // Locked by the build, which has not handed over the store yet.
    refs.reactor = undefined;
    void tab(host)
      .send(HELLO)
      .catch(() => undefined);
    await tick();
    await tab(host).send({
      ...HELLO,
      version: { ...HELLO.version, appBuildId: "next-build" },
    });
    expect(host.retired).toBe(true);
    const next = otherWorkerAcquires(names.reactor);
    await tick();
    expect(next.granted).toBe(false);

    const grantedAtClose: boolean[] = [];
    refs.reactor = {
      close: () => {
        grantedAtClose.push(next.granted);
        return Promise.resolve();
      },
    };
    finishBuild();
    await vi.waitFor(() => expect(next.granted).toBe(true));
    expect(grantedAtClose).toEqual([false]);
  });
});

describe("worker retired by a deploy", () => {
  const NEXT_BUILD = {
    ...HELLO,
    version: { ...HELLO.version, appBuildId: "next-build" },
  };
  let module: InProcessReactorModule | undefined;
  let database: Kysely<Database> | undefined;

  afterEach(async () => {
    await module?.reactor.kill().completed;
    await database?.destroy();
    module = undefined;
    database = undefined;
  });

  // A tab's job sits accepted but not started. Unless `paused`, the drain sees
  // the paused queue only as busy.
  async function workerWithAcceptedJob(
    drainMs?: number,
    paused = false,
    pg = new PGlite(),
  ) {
    database = new Kysely<Database>({ dialect: new PGliteDialect(pg) });
    const built = await new ReactorBuilder()
      .withKysely(database)
      .withDocumentModelSources([
        documentModelDocumentModelModule as unknown as DocumentModelModule,
      ])
      .buildModule();
    module = built;
    const queue = built.queue as InMemoryQueue;
    queue.pause();
    const { id: jobId } = await built.reactor.create(
      withSignaturePolicy(
        documentModelDocumentModelModule.utils.createDocument(),
        "legacy",
      ),
    );
    const jobStatus = async () =>
      (await built.reactor.getJobStatus(jobId)).status;
    const statusAtStop: string[] = [];
    const { names, host } = await workerWith(
      () => Promise.resolve(),
      undefined,
      {
        queue: () => (paused ? queue : { isDrained: queue.isDrained }),
        drainMs,
        stopReactor: async () => {
          statusAtStop.push(await jobStatus());
          await built.reactor.kill().completed;
        },
      },
    );
    const statusAtReload: Promise<string>[] = [];
    const open = tab(host, () => statusAtReload.push(jobStatus()));
    await open.send(HELLO);
    return { names, host, queue, open, statusAtStop, statusAtReload };
  }

  it("tells the tabs to reload only once a job accepted before the mismatch finished", async () => {
    const { host, queue, open, statusAtStop, statusAtReload } =
      await workerWithAcceptedJob();
    expect(await tab(host).send(NEXT_BUILD)).toEqual({ ok: false });
    expect(host.retired).toBe(true);
    await tick();
    expect(open.reloads).toEqual([]);
    expect(statusAtStop).toEqual([]);

    await queue.resume();
    await vi.waitFor(() => expect(statusAtStop).toHaveLength(1), {
      timeout: 5_000,
    });
    await vi.waitFor(() => expect(open.reloads).toHaveLength(1));
    const done = [JobStatus.WRITE_READY, JobStatus.READ_READY];
    expect(done).toContain(await statusAtReload[0]);
    expect(done).toContain(statusAtStop[0]);
  });

  it("tells the tabs to reload and releases the stores once the bound passes", async () => {
    const { names, host, open, statusAtStop } =
      await workerWithAcceptedJob(300);
    const startedAt = Date.now();
    await tab(host).send(NEXT_BUILD);
    const next = otherWorkerAcquires(names.reactor);
    await tick();
    expect(open.reloads).toEqual([]);
    await vi.waitFor(() => expect(next.granted).toBe(true), {
      timeout: 5_000,
    });
    await vi.waitFor(() => expect(open.reloads).toHaveLength(1));
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(300);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(statusAtStop).toEqual([JobStatus.PENDING]);
  });

  // An operator paused it; draining would run their held work or wait out the bound.
  it("does not wait on a paused queue", async () => {
    const { names, host, open, statusAtStop } = await workerWithAcceptedJob(
      60_000,
      true,
    );
    await tab(host).send(NEXT_BUILD);
    const next = otherWorkerAcquires(names.reactor);
    await vi.waitFor(() => expect(next.granted).toBe(true), {
      timeout: 5_000,
    });
    await vi.waitFor(() => expect(open.reloads).toHaveLength(1));
    expect(statusAtStop).toEqual([JobStatus.PENDING]);
  });

  it("waits on a paused queue's executing job, not its pending ones", async () => {
    const pg = new PGlite();
    const query = pg.query.bind(pg);
    const writing = deferred();
    const release = deferred();
    pg.query = (async (sql: string, ...rest: unknown[]) => {
      if (/^insert into "reactor"\."Operation"/.test(sql)) {
        writing.resolve();
        await release.promise;
      }
      return query(sql, ...(rest as []));
    }) as typeof pg.query;
    const { host, queue, open, statusAtStop, statusAtReload } =
      await workerWithAcceptedJob(60_000, true, pg);
    // Its JOB_AVAILABLE subscriber runs the job, so resume settles after it.
    const resumed = queue.resume();
    await writing.promise;
    queue.pause();
    await tab(host).send(NEXT_BUILD);
    await tick();
    const reloadsWhileWriting = open.reloads.length;
    release.resolve();
    await resumed;
    expect(reloadsWhileWriting).toBe(0);
    await vi.waitFor(() => expect(statusAtStop).toHaveLength(1), {
      timeout: 5_000,
    });
    await vi.waitFor(() => expect(open.reloads).toHaveLength(1));
    const done = [JobStatus.WRITE_READY, JobStatus.READ_READY];
    expect(done).toContain(await statusAtReload[0]);
  });

  it("does not wait on the queue for a retirement that is not a deploy", async () => {
    const { names, host, statusAtStop } = await workerWithAcceptedJob(60_000);
    host.retireAndReload("admin restart", crypto.randomUUID());
    const next = otherWorkerAcquires(names.reactor);
    await vi.waitFor(() => expect(next.granted).toBe(true), {
      timeout: 5_000,
    });
    expect(statusAtStop).toEqual([JobStatus.PENDING]);
  });

  // Inbound sync jobs would keep the queue busy; only the tabs' jobs are waited on.
  it("stops sync before it waits on the queue", async () => {
    const order: string[] = [];
    const { host } = await workerWith(() => Promise.resolve(), undefined, {
      stopSync: () => order.push("sync stopped"),
      queue: () => ({
        get isDrained() {
          order.push("queue checked");
          return true;
        },
      }),
    });
    const open = tab(host);
    await open.send(HELLO);
    await tab(host).send(NEXT_BUILD);
    await vi.waitFor(() => expect(open.reloads).toHaveLength(1));
    expect(order[0]).toBe("sync stopped");
    expect(order).toContain("queue checked");
  });
});

describe("worker after Clear storage", () => {
  it("retires into a fresh worker when clearing the files fails", async () => {
    const clear = vi.fn(() => Promise.reject(new Error("idb aborted")));
    const { names, host } = await workerWith(clear);
    const open = tab(host);
    await open.send(HELLO);

    await expect(
      open.send({ k: "admin", method: "clearStorage" }),
    ).rejects.toThrow("idb aborted");
    await vi.waitFor(() => expect(open.reloads).toHaveLength(1));
    const gen = open.reloads[0].workerGen;
    expect(gen).toMatch(/^[0-9a-f-]{36}$/);
    const next = otherWorkerAcquires(names.reactor);
    await vi.waitFor(() => expect(next.granted).toBe(true));

    const late = tab(host);
    await expect(late.send(HELLO)).rejects.toThrow(/retired/);
    expect(late.reloads).toEqual([open.reloads[0]]);

    await expect(
      late.send({ k: "admin", method: "clearStorage" }),
    ).rejects.toThrow(/retired/);
    expect(late.reloads.at(-1)?.workerGen).toBe(gen);
    expect(clear).toHaveBeenCalledOnce();
  });

  it("replays the reload to a tab that connects after it, and refuses its data", async () => {
    const { host } = await workerWith(() => Promise.resolve());
    const open = tab(host);
    await open.send(HELLO);
    await open.send({ k: "admin", method: "clearStorage" });
    await vi.waitFor(() => expect(open.reloads).toHaveLength(1));
    expect(open.reloads[0].reason).toBe("storage cleared");

    const late = tab(host);
    await expect(late.send(HELLO)).rejects.toThrow(/retired/);
    expect(late.reloads).toEqual([open.reloads[0]]);
    await expect(
      late.send({ k: "sync-op", method: "list", args: [] }),
    ).rejects.toThrow(/retired/);
  });

  it("retires on an admin restart, replaying it to a late tab and releasing the stores", async () => {
    const { names, host } = await workerWith(() => Promise.resolve());
    const open = tab(host);
    await open.send(HELLO);
    await open.send({ k: "admin", method: "restart" });
    await vi.waitFor(() => expect(open.reloads).toHaveLength(1));
    expect(open.reloads[0].reason).toBe("admin restart");

    const late = tab(host);
    await expect(late.send(HELLO)).rejects.toThrow(/retired/);
    expect(late.reloads).toEqual([open.reloads[0]]);

    const relationalNext = otherWorkerAcquires(names.relational);
    const reactorNext = otherWorkerAcquires(names.reactor);
    await vi.waitFor(() => {
      expect(relationalNext.granted).toBe(true);
      expect(reactorNext.granted).toBe(true);
    });
  });

  it("is how the worker wires its stores to the host's retirement", () => {
    const worker = readFileSync(
      fileURLToPath(new URL("../reactor.worker.ts", import.meta.url)),
      "utf8",
    );
    expect(worker).toMatch(/isRetired: \(\) => host\.retired,/);
    expect(worker).toMatch(/onRetire: \(\) => stores\.retire\(\),/);
    expect(worker).toMatch(/drainBeforeReload: \(\) => stores\.drain\(\),/);
    expect(worker).toMatch(/stopSync,/);
    expect(worker).toMatch(
      /stopSync\(\);\s*const stopping = Promise\.allSettled\(\[\s*syncStopped,/,
    );
    // A stopped reactor's queue keeps its unstarted jobs; a re-stop must not wait on them.
    expect(worker).toMatch(/queue: \(\) => reactorQueue,/);
    expect(worker).toMatch(
      /reactorInstance = undefined;\s*reactorQueue = undefined;/,
    );
    expect(worker).toMatch(
      /retireWorker: \(reason\) =>\s*host\.retireAndReload\(reason, crypto\.randomUUID\(\)\)/,
    );
    expect(worker).not.toMatch(/broadcastReload\(/);
    expect(worker).toMatch(
      /onAdminRestart: \(\) =>\s*host\.retireAndReload\("admin restart", crypto\.randomUUID\(\)\)/,
    );
    expect(worker).toMatch(
      /begin: \(\) =>\s*setMigration\(\{\s*status: "migrating"/,
    );
  });
});

describe("worker after a failed boot", () => {
  it("retires instead of reopening a store whose close did not settle", async () => {
    const reactorClose = deferred();
    let builds = 0;
    const { names, refs, stores } = await setup(
      undefined,
      {
        isRetired: () => host.retired,
        retireWorker: (reason) =>
          host.retireAndReload(reason, crypto.randomUUID()),
      },
      {},
      reactorClose.promise,
    );
    const host: ReactorHost = new ReactorHost({
      build: async () => {
        builds += 1;
        refs.reactor ??= fakeStore();
        await stores.releaseAfterBootFailure();
        throw new Error("migration failed");
      },
      onRetire: () => stores.retire(),
    });
    const open = tab(host);
    await expect(open.send(HELLO)).rejects.toThrow("migration failed");
    await expect(open.send(HELLO)).rejects.toThrow(/retired/);
    expect(builds).toBe(1);
    expect(open.reloads).toHaveLength(1);
    expect(open.reloads[0].workerGen).toMatch(/^[0-9a-f-]{36}$/);

    const relationalNext = otherWorkerAcquires(names.relational);
    const reactorNext = otherWorkerAcquires(names.reactor);
    await vi.waitFor(() => expect(relationalNext.granted).toBe(true));
    await tick();
    expect(reactorNext.granted).toBe(false);
    reactorClose.resolve();
  });
});
