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

async function setup(relationalClose?: Promise<void>) {
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
    close: (store) => closeWithin(store, 50),
  });
  return { names, refs, log, stores };
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
    const { names, stores } = await setup(relationalClose.promise);
    const filesDone = deferred();
    const migrating = stores.runAdmin(
      (store) => closeWithin(store, 60_000),
      async (release) => {
        await filesDone.promise;
        release();
      },
    );
    await tick();

    const retiring = stores.retire();
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
    await stores.runAdmin(closeWithin, (release) => {
      log.push("files");
      expect(refs).toEqual({ relational: undefined, reactor: undefined });
      release();
      return Promise.resolve();
    });
    expect(log).toEqual(["stop", "files"]);
  });

  it("refuses an admin flow once the worker is retired", async () => {
    const { stores } = await setup();
    const retiring = stores.retire();
    const flow = vi.fn(() => Promise.resolve());
    await expect(stores.runAdmin(closeWithin, flow)).rejects.toThrow(
      /no longer owns/,
    );
    expect(flow).not.toHaveBeenCalled();
    await retiring;
  });

  it("refuses a second admin flow queued behind the first", async () => {
    const { stores } = await setup();
    const first = stores.runAdmin(closeWithin, (release) => {
      release();
      return Promise.resolve();
    });
    const second = vi.fn(() => Promise.resolve());
    await expect(stores.runAdmin(closeWithin, second)).rejects.toThrow(
      /no longer owns/,
    );
    await first;
    expect(second).not.toHaveBeenCalled();
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

  it("keeps the locks of an admin flow that failed before releasing them", async () => {
    const { names, stores } = await setup();
    await expect(
      stores.runAdmin(closeWithin, () =>
        Promise.reject(new Error("clear failed")),
      ),
    ).rejects.toThrow("clear failed");
    await stores.retire();
    const reactorNext = otherWorkerAcquires(names.reactor);
    await tick();
    expect(reactorNext.granted).toBe(false);
  });
});
