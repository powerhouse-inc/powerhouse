import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ConnectionStateModule from "../connection-state.js";
import type * as BudgetModule from "./poisoned-store-budget.js";
import { RETIRED_WORKER_RELOAD_REASON } from "@powerhousedao/reactor-browser/rpc";
import { POISONED_STORE_RELOAD_REASON } from "./poisoned-store-reload.js";

const MISMATCH = "reactor version mismatch";
const FLAGS_CHANGED =
  "reactor enforcement flags changed (worker: none, tab: authEnforcement)";

let connectionState: typeof ConnectionStateModule;
let budget: typeof BudgetModule;

/** A reload starts a fresh page: module state goes, sessionStorage stays. */
async function loadPage(): Promise<void> {
  vi.resetModules();
  connectionState = await import("../connection-state.js");
  budget = await import("./poisoned-store-budget.js");
}

beforeEach(loadPage);

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

describe("poisoned-store reload budget", () => {
  it("refuses a third poisoned reload in a row however slowly they come", () => {
    const storage = memoryStorage();
    const cycle = 150_000;

    expect(budget.claimPoisonedStoreReload(storage, 0)).toBe(true);
    expect(budget.claimPoisonedStoreReload(storage, cycle)).toBe(true);
    expect(budget.claimPoisonedStoreReload(storage, 2 * cycle)).toBe(false);
    expect(budget.claimPoisonedStoreReload(storage, 3 * cycle)).toBe(false);
  });

  it("starts counting again after ten minutes without a poison", () => {
    const storage = memoryStorage();

    expect(budget.claimPoisonedStoreReload(storage, 0)).toBe(true);
    expect(budget.claimPoisonedStoreReload(storage, 60_000)).toBe(true);
    expect(budget.claimPoisonedStoreReload(storage, 60_000 + 10 * 60_000)).toBe(
      true,
    );
  });

  it("refuses when it cannot count", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => undefined,
    };
    expect(budget.claimPoisonedStoreReload(broken, 0)).toBe(false);
  });

  it("stops reloading past the budget and shows the storage-unusable state", async () => {
    const storage = memoryStorage();
    const reload = vi.fn();

    budget.reloadForWorker(POISONED_STORE_RELOAD_REASON, reload, storage, 0);
    await loadPage();
    budget.reloadForWorker(POISONED_STORE_RELOAD_REASON, reload, storage, 1);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(connectionState.getWorkerConnectionStatus()).toBe("connected");

    await loadPage();
    budget.reloadForWorker(POISONED_STORE_RELOAD_REASON, reload, storage, 2);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(connectionState.getWorkerConnectionStatus()).toBe(
      "storage-unusable",
    );

    connectionState.setWorkerConnectionStatus("connected");
    expect(connectionState.getWorkerConnectionStatus()).toBe(
      "storage-unusable",
    );
  });

  it("reloads for any other reason without spending the budget", () => {
    const storage = memoryStorage();
    const reload = vi.fn();

    for (let i = 0; i < 5; i++) {
      budget.reloadForWorker("migration complete", reload, storage, i);
    }
    expect(reload).toHaveBeenCalledTimes(5);
    expect(budget.claimPoisonedStoreReload(storage, 10)).toBe(true);
  });

  it("reloads the page for a poisoned in-tab store within the same budget", async () => {
    const reload = vi.fn();
    vi.stubGlobal("sessionStorage", memoryStorage());
    try {
      const cause = new Error("dead call");
      budget.reloadPageForPoisonedStore(cause, reload);
      await loadPage();
      budget.reloadPageForPoisonedStore(cause, reload);
      await loadPage();
      budget.reloadPageForPoisonedStore(cause, reload);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(reload).toHaveBeenCalledTimes(2);
    expect(connectionState.getWorkerConnectionStatus()).toBe(
      "storage-unusable",
    );
  });

  it("still reloads a tab a retired worker sends to the current one, past the budget", async () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    for (let i = 0; i < 3; i++) {
      await loadPage();
      budget.reloadForWorker(POISONED_STORE_RELOAD_REASON, reload, storage, i);
    }
    expect(reload).toHaveBeenCalledTimes(2);

    budget.reloadForWorker(RETIRED_WORKER_RELOAD_REASON, reload, storage, 3);
    expect(reload).toHaveBeenCalledTimes(3);
  });

  it("spends one slot when both in-tab stores report the same poisoning", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    vi.stubGlobal("sessionStorage", storage);
    try {
      budget.reloadPageForPoisonedStore(new Error("reactor store"), reload);
      budget.reloadPageForPoisonedStore(new Error("relational store"), reload);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(reload).toHaveBeenCalledOnce();
    expect(budget.claimPoisonedStoreReload(storage, Date.now())).toBe(true);
  });
  // Two builds served at once retire each other's worker; tabs would bounce forever.
  it("stops reloading on repeated build mismatches and shows the version conflict", async () => {
    const storage = memoryStorage();
    const reload = vi.fn();

    budget.reloadForWorker(MISMATCH, reload, storage, 0);
    await loadPage();
    budget.reloadForWorker(FLAGS_CHANGED, reload, storage, 1);
    await loadPage();
    budget.reloadForWorker(MISMATCH, reload, storage, 2);

    expect(reload).toHaveBeenCalledTimes(2);
    expect(connectionState.getWorkerConnectionStatus()).toBe(
      "version-conflict",
    );
    connectionState.setWorkerConnectionStatus("connected");
    expect(connectionState.getWorkerConnectionStatus()).toBe(
      "version-conflict",
    );
  });

  it("keeps mismatch and poisoned-store reloads on separate budgets", async () => {
    const storage = memoryStorage();
    const reload = vi.fn();

    for (let i = 0; i < 2; i++) {
      await loadPage();
      budget.reloadForWorker(MISMATCH, reload, storage, i);
    }
    await loadPage();
    budget.reloadForWorker(POISONED_STORE_RELOAD_REASON, reload, storage, 2);
    expect(reload).toHaveBeenCalledTimes(3);

    await loadPage();
    budget.reloadForWorker(POISONED_STORE_RELOAD_REASON, reload, storage, 3);
    await loadPage();
    budget.reloadForWorker(MISMATCH, reload, storage, 70_000);
    expect(reload).toHaveBeenCalledTimes(5);
  });

  it("reloads for every deploy that lands minutes after the last", async () => {
    const storage = memoryStorage();
    const reload = vi.fn();

    for (const minute of [0, 8, 16, 24]) {
      await loadPage();
      budget.reloadForWorker(MISMATCH, reload, storage, minute * 60_000);
    }

    expect(reload).toHaveBeenCalledTimes(4);
    expect(connectionState.getWorkerConnectionStatus()).toBe("connected");
  });

  it("spends one slot when a page hears the same mismatch twice", async () => {
    const storage = memoryStorage();
    const reload = vi.fn();

    budget.reloadForWorker(MISMATCH, reload, storage, 0);
    budget.reloadForWorker(MISMATCH, reload, storage, 1);
    expect(reload).toHaveBeenCalledOnce();

    await loadPage();
    budget.reloadForWorker(MISMATCH, reload, storage, 2);
    await loadPage();
    budget.reloadForWorker(MISMATCH, reload, storage, 3);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
