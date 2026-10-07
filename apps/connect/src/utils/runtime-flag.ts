/**
 * Shared machinery for Connect's per-tab runtime boolean flags (reactorWorker,
 * multiReactor, ...). Each flag resolves from a query-param override, then a
 * stored dev override, then its config default; a query-param override is
 * persisted to localStorage so it survives a refresh.
 *
 * localStorage access is wrapped so a private-mode or storage-blocked browser
 * degrades to the config/default value instead of throwing during boot.
 */

export type RuntimeFlagInput = {
  configFlag: boolean;
  queryParam?: string | null;
  storedValue?: string | null;
};

/**
 * Resolves a flag from its inputs: a query-param override wins, then a stored
 * dev override, then the config flag. Pure, so it is unit-testable without a
 * window.
 */
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
  /** Query-param name (e.g. `multiReactor`). */
  queryKey: string;
  /** localStorage key (e.g. `ph:multiReactor`). */
  storageKey: string;
  /** Reads this flag's config-level default off the runtime config. */
  readConfigFlag: () => boolean;
};

/**
 * The effective flag from config plus any dev override. A query-param override
 * is persisted so it survives a refresh. Returns the config flag unchanged when
 * there is no window, and treats a throwing localStorage (private mode, blocked
 * storage) as no stored override rather than crashing.
 */
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
    // Storage blocked (private mode, disabled cookies): no stored override.
    return null;
  }
}

function persistStoredValue(storageKey: string, enabled: boolean): void {
  try {
    window.localStorage.setItem(storageKey, enabled ? "true" : "false");
  } catch {
    // Storage blocked or full: the override still applies for this session.
  }
}

export function parseFlag(
  value: string | null | undefined,
): boolean | undefined {
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
