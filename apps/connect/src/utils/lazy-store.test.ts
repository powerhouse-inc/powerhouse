import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeWithin } from "./close-within.js";
import { createLazyStore } from "./lazy-store.js";
import { createStoreLocks } from "./store-lock.js";
import { createWorkerStores } from "./worker-stores.js";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const undo of cleanup.splice(0)) undo();
});

let seq = 0;

function otherWorkerAcquires(namespace: string) {
  const other = createStoreLocks(navigator.locks);
  const state = { granted: false };
  void other.acquire(namespace).then(() => (state.granted = true));
  cleanup.push(() => other.release(namespace));
  return state;
}

// The worker's wiring: the lazy store behind the worker's store lifecycle.
function setup() {
  seq += 1;
  const namespace = `lazy-rel-${seq}`;
  const locks = createStoreLocks(navigator.locks);
  cleanup.push(() => locks.release(namespace));
  const opened: { closed: boolean }[] = [];
  let gate: Promise<void> = Promise.resolve();
  let fail = false;
  const open = vi.fn(async (ns: string) => {
    await locks.acquire(ns);
    await gate;
    if (fail) {
      locks.release(ns);
      throw new Error("wasm failed");
    }
    const store = {
      closed: false,
      close: () => {
        store.closed = true;
        return Promise.resolve();
      },
    };
    opened.push(store);
    return store;
  });
  const relational = createLazyStore({
    open,
    discard: (ns, store) => stores.releaseFailedOpen(ns, store),
  });
  let retired = false;
  const stores = createWorkerStores({
    locks,
    stopReactor: () => Promise.resolve(),
    stopSync: () => undefined,
    queue: () => undefined,
    relational: () => relational.snapshot(),
    reactor: () => ({}),
    forget: () => relational.forget(),
    isRetired: () => retired,
    retireWorker: () => {
      retired = true;
    },
    close: (store) => closeWithin(store, 50),
  });
  return {
    namespace,
    relational,
    stores,
    open,
    opened,
    hold: () => {
      let release = () => undefined as void;
      gate = new Promise<void>((resolve) => (release = resolve));
      return () => release();
    },
    failOpens: () => (fail = true),
  };
}

describe("lazily opened relational store", () => {
  it("opens nothing until the first use, then once for concurrent uses", async () => {
    const { namespace, relational, open, hold } = setup();
    relational.arm(namespace);
    expect(open).not.toHaveBeenCalled();
    // Not locked either: another worker may take the store meanwhile.
    expect(relational.snapshot()).toEqual({ namespace, store: undefined });

    const release = hold();
    const first = relational.get();
    const second = relational.get();
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBeDefined();
    expect(a).toBe(b);
    expect(open).toHaveBeenCalledTimes(1);
    expect(await relational.get()).toBe(a);
  });

  it("is not opened by a disarmed worker", async () => {
    const { namespace, relational, open } = setup();
    relational.arm(namespace);
    relational.forget();
    expect(await relational.get()).toBeUndefined();
    expect(open).not.toHaveBeenCalled();
  });

  it("closes an open overtaken by a retirement and hands its lock on", async () => {
    const { namespace, relational, stores, opened, hold } = setup();
    relational.arm(namespace);
    const release = hold();
    const using = relational.get();
    // The open holds the lock and waits on PGlite.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await stores.retire();
    const next = otherWorkerAcquires(namespace);
    release();

    expect(await using).toBeUndefined();
    await relational.settled();
    expect(opened.map((store) => store.closed)).toEqual([true]);
    await vi.waitFor(() => expect(next.granted).toBe(true));
  });

  it("releases an opened store on retirement", async () => {
    const { namespace, relational, stores, opened } = setup();
    relational.arm(namespace);
    await relational.get();
    await stores.retire();
    expect(opened.map((store) => store.closed)).toEqual([true]);
    const next = otherWorkerAcquires(namespace);
    await vi.waitFor(() => expect(next.granted).toBe(true));
  });

  it("does not retry a failed open until it is re-armed", async () => {
    const { namespace, relational, open, failOpens } = setup();
    relational.arm(namespace);
    failOpens();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await relational.get()).toBeUndefined();
    expect(await relational.get()).toBeUndefined();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("is how the worker opens its relational store", () => {
    const worker = readFileSync(
      fileURLToPath(new URL("../reactor.worker.ts", import.meta.url)),
      "utf8",
    );
    // Boot reads the store's major from its files and opens nothing.
    expect(worker).not.toMatch(/await openRelational\(/);
    expect(worker).toMatch(/relational\.arm\(construct\.relationalNamespace\)/);
    expect(worker).toMatch(/relational: \(\) => relational\.snapshot\(\),/);
    expect(worker.match(/await relational\.get\(\)/g)).toHaveLength(2);
    // Admin flows lock the relational files even when they were never opened.
    expect(worker.match(/await lockRelationalFiles\(\)/g)).toHaveLength(2);
  });
});
