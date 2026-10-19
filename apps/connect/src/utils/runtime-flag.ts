export type RuntimeFlagInput = {
  configFlag: boolean;
  queryParam?: string | null;
  storedValue?: string | null;
};

// A query-param override wins, then a stored dev override, then the config flag.
export function resolveRuntimeFlag(input: RuntimeFlagInput): boolean {
  const fromQuery = parseFlag(input.queryParam);
  if (fromQuery !== undefined) {
    return fromQuery;
  }
  const fromStore = parseFlag(input.storedValue);
  if (fromStore !== undefined) {
    return fromStore;
  }
  return input.configFlag;
}

export type RuntimeFlagKeys = {
  queryKey: string;
  storageKey: string;
  readConfigFlag: () => boolean;
};

// Effective flag from config + dev override; a query-param override is persisted
// to localStorage so it survives a refresh. Blocked storage reads as no override.
export function isRuntimeFlagEnabled(keys: RuntimeFlagKeys): boolean {
  const configFlag = keys.readConfigFlag();
  if (typeof window === "undefined") {
    return configFlag;
  }
  const queryParam = new URLSearchParams(window.location.search).get(
    keys.queryKey,
  );
  const storedValue = readStoredValue(keys.storageKey);
  const enabled = resolveRuntimeFlag({ configFlag, queryParam, storedValue });
  // Persist only an explicit override, not an unrecognized value.
  if (parseFlag(queryParam) !== undefined) {
    persistStoredValue(keys.storageKey, enabled);
  }
  return enabled;
}

function readStoredValue(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function persistStoredValue(storageKey: string, enabled: boolean): void {
  try {
    window.localStorage.setItem(storageKey, enabled ? "true" : "false");
  } catch {
    // The override still applies for this page load.
  }
}

function parseFlag(value: string | null | undefined): boolean | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  // Unrecognized value (e.g. a typo): no override, fall through to store/config.
  return undefined;
}
