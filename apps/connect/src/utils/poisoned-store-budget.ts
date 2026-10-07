import { setWorkerConnectionStatus } from "../connection-state.js";
import { POISONED_STORE_RELOAD_REASON } from "./poisoned-store-reload.js";

const BUDGET_KEY = "ph-connect:poisoned-store-reloads";
const BUDGET_LIMIT = 2;
const HEALTHY_RESET_MS = 10 * 60_000;

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

/**
 * Spends one poisoned-store reload. Reloads are counted in a row, and the
 * count resets only after ten minutes without a poison, so a slow boot loop
 * is caught too; false past the budget, or when reloads cannot be counted.
 */
export function claimPoisonedStoreReload(
  storage: BudgetStorage | undefined = sessionStore(),
  now: number = Date.now(),
): boolean {
  if (storage === undefined) return false;
  try {
    const previous = readRecord(storage.getItem(BUDGET_KEY));
    const count =
      now - previous.lastAt >= HEALTHY_RESET_MS ? 0 : previous.count;
    const allowed = count < BUDGET_LIMIT;
    storage.setItem(
      BUDGET_KEY,
      JSON.stringify({ count: allowed ? count + 1 : count, lastAt: now }),
    );
    return allowed;
  } catch {
    return false;
  }
}

/** One page reload answers every store that reports the same poisoning. */
let reloadRequested = false;

/** Past the budget a poisoned store stops reloading and shows storage-unusable, so clear storage stays reachable. */
export function reloadForPoisonedStore(
  reload: () => void,
  storage?: BudgetStorage,
  now?: number,
): void {
  if (reloadRequested) return;
  if (claimPoisonedStoreReload(storage, now)) {
    reloadRequested = true;
    reload();
    return;
  }
  setWorkerConnectionStatus("storage-unusable");
}

/** onPoisoned for an in-tab store: the page reload reopens it, within the same budget. */
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
  reload();
}
