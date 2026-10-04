import { getRuntimeConfig } from "../runtime-config.js";

export const MULTI_REACTOR_QUERY_KEY = "multiReactor";
export const MULTI_REACTOR_STORAGE_KEY = "ph:multiReactor";

export type MultiReactorFlagInput = {
  configFlag: boolean;
  queryParam?: string | null;
  storedValue?: string | null;
};

// A query-param override wins, then a stored dev override, then the config flag.
// Mirrors resolveReactorWorkerEnabled: pure so it is unit-testable without a
// window.
export function resolveMultiReactorEnabled(
  input: MultiReactorFlagInput,
): boolean {
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

// Effective flag from config + dev override; a query-param override is persisted
// to localStorage so it survives a refresh.
export function isMultiReactorEnabled(): boolean {
  const configFlag = getRuntimeConfig().connect.instance?.multiReactor ?? false;
  if (typeof window === "undefined") {
    return configFlag;
  }
  const queryParam = new URLSearchParams(window.location.search).get(
    MULTI_REACTOR_QUERY_KEY,
  );
  const storedValue = window.localStorage.getItem(MULTI_REACTOR_STORAGE_KEY);
  const enabled = resolveMultiReactorEnabled({
    configFlag,
    queryParam,
    storedValue,
  });
  // Persist only an explicit override, not an unrecognized value.
  if (parseFlag(queryParam) !== undefined) {
    window.localStorage.setItem(
      MULTI_REACTOR_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  }
  return enabled;
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
