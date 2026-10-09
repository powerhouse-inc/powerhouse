import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ConnectionStateModule from "../connection-state.js";
import type * as WorkerStartupModule from "./worker-startup.js";
import { createStoreLocks } from "./store-lock.js";

let state: typeof ConnectionStateModule;
let startupOwningStores: typeof WorkerStartupModule.startupOwningStores;

beforeEach(async () => {
  vi.resetModules();
  state = await import("../connection-state.js");
  ({ startupOwningStores } = await import("./worker-startup.js"));
});

const watch = { locks: navigator.locks, intervalMs: 5, graceMs: 0 };

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("worker startup while another worker holds the stores", () => {
  it("waits while the store lock is held, and stops waiting once it is free", async () => {
    const oldWorker = createStoreLocks(navigator.locks);
    const newWorker = createStoreLocks(navigator.locks);
    await oldWorker.acquire("ws-a");
    const acquired = newWorker.acquire("ws-a");

    const seed = deferred();
    let isWaiting: (() => boolean) | undefined;
    const running = startupOwningStores(
      (options) => {
        isWaiting = options.isWaiting;
        return seed.promise;
      },
      ["ws-a"],
      watch,
    );
    await vi.waitFor(() => expect(isWaiting?.()).toBe(true));
    expect(state.getWorkerConnectionStatus()).toBe("storage-held");

    oldWorker.release("ws-a");
    await acquired;
    await vi.waitFor(() => expect(isWaiting?.()).toBe(false));
    expect(state.getWorkerConnectionStatus()).toBe("connected");

    seed.resolve();
    await running;
    newWorker.release("ws-a");
  });

  it("keeps storage-held when startup fails during the wait", async () => {
    const oldWorker = createStoreLocks(navigator.locks);
    const newWorker = createStoreLocks(navigator.locks);
    await oldWorker.acquire("ws-b");
    const acquired = newWorker.acquire("ws-b");

    const seed = deferred();
    const running = startupOwningStores(() => seed.promise, ["ws-b"], watch);
    await vi.waitFor(() =>
      expect(state.getWorkerConnectionStatus()).toBe("storage-held"),
    );
    seed.reject(new Error("seed failed"));
    await expect(running).rejects.toThrow("seed failed");
    expect(state.getWorkerConnectionStatus()).toBe("storage-held");

    oldWorker.release("ws-b");
    await acquired;
    newWorker.release("ws-b");
  });

  it("clears storage-held once startup completes", async () => {
    state.setWorkerConnectionStatus("storage-held");
    await startupOwningStores(() => Promise.resolve(), ["ws-c"], watch);
    expect(state.getWorkerConnectionStatus()).toBe("connected");
  });
});
