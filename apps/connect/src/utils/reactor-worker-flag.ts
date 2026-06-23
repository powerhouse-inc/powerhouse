import { getRuntimeConfig } from "../runtime-config.js";

export const REACTOR_WORKER_QUERY_KEY = "reactorWorker";
export const REACTOR_WORKER_STORAGE_KEY = "ph:reactorWorker";

export type ReactorWorkerFlagInput = {
  configFlag: boolean;
  queryParam?: string | null;
  storedValue?: string | null;
};

export function resolveReactorWorkerEnabled(
  input: ReactorWorkerFlagInput,
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
export function isReactorWorkerEnabled(): boolean {
  const configFlag =
    getRuntimeConfig().connect.instance?.reactorWorker ?? false;
  if (typeof window === "undefined") {
    return configFlag;
  }
  const queryParam = new URLSearchParams(window.location.search).get(
    REACTOR_WORKER_QUERY_KEY,
  );
  const storedValue = window.localStorage.getItem(REACTOR_WORKER_STORAGE_KEY);
  const enabled = resolveReactorWorkerEnabled({
    configFlag,
    queryParam,
    storedValue,
  });
  if (queryParam !== null) {
    window.localStorage.setItem(
      REACTOR_WORKER_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  }
  return enabled;
}

function parseFlag(value: string | null | undefined): boolean | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return value === "true" || value === "1";
}
