import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { IReactorClient } from "@powerhousedao/reactor";
import { ReactorHost } from "@powerhousedao/reactor-browser/rpc";
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

async function setup(relationalClose?: Promise<void>, host?: Retirement) {
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
  } = { relational: fakeStore(relationalClose), reactor: fakeStore() };
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
    stopReactor: () => {
      log.push("stop");
      return Promise.resolve();
    },
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
async function workerWith(clear: () => Promise<void>) {
  const { names, stores } = await setup(undefined, {
    isRetired: () => host.retired,
    retireWorker: (reason) => host.retireAndReload(reason, crypto.randomUUID()),
  });
  const host: ReactorHost = new ReactorHost({
    build: () => Promise.resolve({} as IReactorClient),
    onRetire: () => stores.retire(),
    onSyncOp: () => Promise.reject(new Error("SyncManager not available")),
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
  return { names, host };
}

function tab(host: ReactorHost) {
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

  it("is how the worker wires its stores to the host's retirement", () => {
    const worker = readFileSync(
      fileURLToPath(new URL("../reactor.worker.ts", import.meta.url)),
      "utf8",
    );
    expect(worker).toMatch(/isRetired: \(\) => host\.retired,/);
    expect(worker).toMatch(
      /retireWorker: \(reason\) =>\s*host\.retireAndReload\(reason, crypto\.randomUUID\(\)\)/,
    );
    expect(worker).not.toMatch(/broadcastReload\("(storage cleared|migration)/);
    expect(worker).toMatch(
      /begin: \(\) =>\s*setMigration\(\{\s*status: "migrating"/,
    );
  });
});
