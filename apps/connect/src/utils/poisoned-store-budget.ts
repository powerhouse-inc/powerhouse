import { setWorkerConnectionStatus } from "../connection-state.js";
import { POISONED_STORE_RELOAD_REASON } from "./poisoned-store-reload.js";

const BUDGET_KEY = "ph-connect:poisoned-store-reloads";
const BUDGET_LIMIT = 2;
const BUDGET_WINDOW_MS = 5 * 60_000;

type BudgetStorage = Pick<Storage, "getItem" | "setItem">;

function sessionStore(): BudgetStorage | undefined {
  try {
    return globalThis.sessionStorage as BudgetStorage | undefined;
  } catch {
    return undefined;
  }
}

/** Spends one poisoned-store reload; false past the budget, or when reloads cannot be counted. */
export function claimPoisonedStoreReload(
  storage: BudgetStorage | undefined = sessionStore(),
  now: number = Date.now(),
): boolean {
  if (storage === undefined) return false;
  try {
    const raw = storage.getItem(BUDGET_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const recent = (Array.isArray(parsed) ? parsed : []).filter(
      (at): at is number =>
        typeof at === "number" && now - at < BUDGET_WINDOW_MS,
    );
    const allowed = recent.length < BUDGET_LIMIT;
    if (allowed) recent.push(now);
    storage.setItem(BUDGET_KEY, JSON.stringify(recent));
    return allowed;
  } catch {
    return false;
  }
}

/** Past the budget a poisoned store stops reloading and shows storage-unusable, so clear storage stays reachable. */
export function reloadForPoisonedStore(
  reload: () => void,
  storage?: BudgetStorage,
  now?: number,
): void {
  if (claimPoisonedStoreReload(storage, now)) {
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
