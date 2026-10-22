import { useSyncExternalStore } from "react";

const KEY = "stock-app:settings";
export type StockSettings = { lowStockThreshold: number; pageSize: number };
export const DEFAULT_SETTINGS: StockSettings = {
  lowStockThreshold: 10,
  pageSize: 5,
};

const listeners = new Set<() => void>();
let cached: StockSettings | undefined;

function read(): StockSettings {
  if (cached) return cached;
  try {
    const raw =
      typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    cached = raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<StockSettings>) }
      : DEFAULT_SETTINGS;
  } catch {
    cached = DEFAULT_SETTINGS;
  }
  return cached;
}

export function saveSettings(next: StockSettings) {
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode); keep the value in memory.
  }
  for (const l of listeners) l();
}

export function useStockSettings(): StockSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => DEFAULT_SETTINGS,
  );
}

/** The current settings outside React, e.g. in a route loader. */
export function getStockSettings(): StockSettings {
  return read();
}
