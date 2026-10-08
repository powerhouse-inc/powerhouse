import { isFingerprintMismatchReload } from "@powerhousedao/reactor-browser/rpc";
import {
  setWorkerConnectionStatus,
  type WorkerConnectionStatus,
} from "../connection-state.js";
import { POISONED_STORE_RELOAD_REASON } from "./poisoned-store-reload.js";

const BUDGET_LIMIT = 2;

type Budget = { key: string; quietMs: number };

// Counted in a row; ten quiet minutes reset it, so a slow boot loop is caught too.
const POISONED_STORE: Budget = {
  key: "ph-connect:poisoned-store-reloads",
  quietMs: 10 * 60_000,
};
// Two builds served at once bounce tabs seconds apart; deploys land minutes apart.
const MISMATCH: Budget = {
  key: "ph-connect:mismatch-reloads",
  quietMs: 60_000,
};

type BudgetStorage = Pick<Storage, "getItem" | "setItem">;
type BudgetRecord = { count: number; lastAt: number };

function sessionStore(): BudgetStorage | undefined {
  try {
    return globalThis.sessionStorage as BudgetStorage | undefined;
  } catch {
    return undefined;
  }
}

function readRecord(raw: string | null): BudgetRecord {
  const parsed: unknown = raw ? JSON.parse(raw) : null;
  const record = parsed as Partial<BudgetRecord> | null;
  return typeof record?.count === "number" && typeof record.lastAt === "number"
    ? { count: record.count, lastAt: record.lastAt }
    : { count: 0, lastAt: 0 };
}

function claimReload(
  budget: Budget,
  storage: BudgetStorage | undefined,
  now: number,
): boolean {
  if (storage === undefined) return false;
  try {
    const previous = readRecord(storage.getItem(budget.key));
    const count = now - previous.lastAt >= budget.quietMs ? 0 : previous.count;
    const allowed = count < BUDGET_LIMIT;
    storage.setItem(
      budget.key,
      JSON.stringify({ count: allowed ? count + 1 : count, lastAt: now }),
    );
    return allowed;
  } catch {
    return false;
  }
}

/**
 * Spends one slot of the tab's poisoned-store reload budget; false past the
 * budget, or when reloads cannot be counted.
 */
export function claimPoisonedStoreReload(
  storage: BudgetStorage | undefined = sessionStore(),
  now: number = Date.now(),
): boolean {
  return claimReload(POISONED_STORE, storage, now);
}

/** One page reload answers every budgeted reload the page hears, of either budget. */
let reloadRequested = false;

function reloadWithinBudget(
  budget: Budget,
  reload: () => void,
  pastBudget: WorkerConnectionStatus,
  storage: BudgetStorage | undefined = sessionStore(),
  now: number = Date.now(),
): void {
  if (reloadRequested) return;
  if (claimReload(budget, storage, now)) {
    reloadRequested = true;
    reload();
    return;
  }
  setWorkerConnectionStatus(pastBudget);
}

/** Past the budget a poisoned store stops reloading and shows storage-unusable, so clear storage stays reachable. */
export function reloadForPoisonedStore(
  reload: () => void,
  storage?: BudgetStorage,
  now?: number,
): void {
  reloadWithinBudget(POISONED_STORE, reload, "storage-unusable", storage, now);
}

/** onPoisoned for an in-tab store: the page reload reopens it, within the poisoned-store budget. */
export function reloadPageForPoisonedStore(
  cause: Error,
  reload: () => void = () => window.location.reload(),
): void {
  console.error("[connect] PGlite session poisoned:", cause);
  reloadForPoisonedStore(reload);
}

export function reloadForWorker(
  reason: string,
  reload: () => void,
  storage?: BudgetStorage,
  now?: number,
): void {
  if (reason === POISONED_STORE_RELOAD_REASON) {
    reloadForPoisonedStore(reload, storage, now);
    return;
  }
  // Two builds served at once retire each other's worker; tabs would bounce forever.
  if (isFingerprintMismatchReload(reason)) {
    reloadWithinBudget(MISMATCH, reload, "version-conflict", storage, now);
    return;
  }
  reload();
}
