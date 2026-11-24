import { useSyncExternalStore } from "react";

const PREFIX = "ph-devtools:";

/**
 * `preference`: one value for every tab, in localStorage; a change in one tab
 * shows in the others.
 * `tab`: each tab's own value, in sessionStorage, so it survives a reload of
 * that tab. A tab that has none starts from the value last set in any tab.
 */
export type StoredScope = "preference" | "tab";

export type Stored<T> = {
  get: () => T;
  set: (value: T) => void;
  subscribe: (onChange: () => void) => () => void;
};

export type StoredOptions<T> = {
  /** Saved under `ph-devtools:<key>`. */
  key: string;
  scope: StoredScope;
  fallback: T;
  /** Reads the value from the saved JSON; undefined when it is not one. */
  parse: (json: unknown) => T | undefined;
};

type Area = "localStorage" | "sessionStorage";

// Reading `window.localStorage` itself throws where storage is blocked.
function read(area: Area, key: string): string | null {
  try {
    return window[area].getItem(key);
  } catch {
    return null;
  }
}

function write(area: Area, key: string, raw: string): boolean {
  try {
    window[area].setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

/** A value DevTools keeps in browser storage. Where storage is blocked or
 * full, it lives in memory until the page reloads. */
export function stored<T>({
  key,
  scope,
  fallback,
  parse,
}: StoredOptions<T>): Stored<T> {
  const name = PREFIX + key;
  const own: Area = scope === "tab" ? "sessionStorage" : "localStorage";
  const listeners = new Set<() => void>();
  let unsaved: string | null = null;
  let cache: { raw: string | null; value: T } | undefined;

  const current = (): string | null => {
    if (unsaved !== null) return unsaved;
    const raw = read(own, name);
    if (raw !== null || scope === "preference") return raw;
    const last = read("localStorage", name);
    // Kept as this tab's own, so that what other tabs set later does not move it.
    if (last !== null && !write("sessionStorage", name, last)) unsaved = last;
    return last;
  };

  const decode = (raw: string | null): T => {
    if (raw === null) return fallback;
    try {
      return parse(JSON.parse(raw)) ?? fallback;
    } catch {
      return fallback;
    }
  };

  return {
    get: () => {
      const raw = current();
      if (cache?.raw !== raw) cache = { raw, value: decode(raw) };
      return cache.value;
    },
    set: (value) => {
      const raw = JSON.stringify(value);
      unsaved = write(own, name, raw) ? null : raw;
      if (scope === "tab") write("localStorage", name, raw);
      for (const listener of listeners) listener();
    },
    subscribe: (onChange) => {
      listeners.add(onChange);
      const onStorage = (event: StorageEvent) => {
        if (event.key === name || event.key === null) onChange();
      };
      if (scope === "preference") {
        window.addEventListener("storage", onStorage);
      }
      return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

export function useStored<T>(value: Stored<T>): [T, (next: T) => void] {
  return [useSyncExternalStore(value.subscribe, value.get), value.set];
}
