import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ConnectionStateModule from "../connection-state.js";
import type * as BudgetModule from "./poisoned-store-budget.js";
import { POISONED_STORE_RELOAD_REASON } from "./poisoned-store-reload.js";

let connectionState: typeof ConnectionStateModule;
let budget: typeof BudgetModule;

beforeEach(async () => {
  vi.resetModules();
  connectionState = await import("../connection-state.js");
  budget = await import("./poisoned-store-budget.js");
});

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
  it("allows two reloads within five minutes, then refuses", () => {
    const storage = memoryStorage();
    const start = 1_000_000;

    expect(budget.claimPoisonedStoreReload(storage, start)).toBe(true);
    expect(budget.claimPoisonedStoreReload(storage, start + 60_000)).toBe(true);
    expect(budget.claimPoisonedStoreReload(storage, start + 120_000)).toBe(
      false,
    );
    expect(
      budget.claimPoisonedStoreReload(storage, start + 5 * 60_000 + 1),
    ).toBe(true);
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

  it("stops reloading past the budget and shows the storage-unusable state", () => {
    const storage = memoryStorage();
    const reload = vi.fn();

    budget.reloadForWorker(POISONED_STORE_RELOAD_REASON, reload, storage, 0);
    budget.reloadForWorker(POISONED_STORE_RELOAD_REASON, reload, storage, 1);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(connectionState.getWorkerConnectionStatus()).toBe("connected");

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
});
