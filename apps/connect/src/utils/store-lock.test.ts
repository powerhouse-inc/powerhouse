import { afterEach, describe, expect, it } from "vitest";
import { createStoreLocks, watchStoreLockWait } from "./store-lock.js";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const undo of cleanup.splice(0)) undo();
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("store locks", () => {
  it("makes a second worker wait until the first releases the store", async () => {
    const oldWorker = createStoreLocks(navigator.locks);
    const newWorker = createStoreLocks(navigator.locks);
    await oldWorker.acquire("ns-a");
    cleanup.push(() => oldWorker.release("ns-a"));

    let opened = false;
    const waiting = newWorker.acquire("ns-a").then(() => {
      opened = true;
    });
    cleanup.push(() => newWorker.release("ns-a"));
    await tick();
    expect(opened).toBe(false);

    oldWorker.release("ns-a");
    await waiting;
    expect(opened).toBe(true);
  });

  it("does not block a worker on a store it already holds", async () => {
    const worker = createStoreLocks(navigator.locks);
    await worker.acquire("ns-b");
    cleanup.push(() => worker.release("ns-b"));
    await expect(worker.acquire("ns-b")).resolves.toBeUndefined();
  });

  it("guards each store on its own", async () => {
    const oldWorker = createStoreLocks(navigator.locks);
    const newWorker = createStoreLocks(navigator.locks);
    await oldWorker.acquire("ns-c");
    cleanup.push(() => oldWorker.release("ns-c"));
    await newWorker.acquire("ns-d");
    cleanup.push(() => newWorker.release("ns-d"));
  });

  it("reports a worker waiting on a held store", async () => {
    const oldWorker = createStoreLocks(navigator.locks);
    const newWorker = createStoreLocks(navigator.locks);
    await oldWorker.acquire("ns-e");
    let waits = 0;
    const stop = watchStoreLockWait(["ns-e"], () => (waits += 1), {
      locks: navigator.locks,
      intervalMs: 5,
    });
    cleanup.push(stop);
    await tick();
    expect(waits).toBe(0);

    const waiting = newWorker.acquire("ns-e");
    await tick();
    expect(waits).toBeGreaterThan(0);

    oldWorker.release("ns-e");
    await waiting;
    newWorker.release("ns-e");
  });
});
