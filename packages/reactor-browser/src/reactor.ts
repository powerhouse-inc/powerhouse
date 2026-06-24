import type { IReactorClient } from "@powerhousedao/reactor";
import { setDrives } from "./hooks/drives.js";
import { getDrives } from "./utils/drives.js";

export type ReactorDefaultDrivesConfig = {
  defaultDrivesUrl?: string[];
};

export type RefreshReactorDataConfig = {
  debounceDelayMs?: number;
  immediateThresholdMs?: number;
};

const DEFAULT_DEBOUNCE_DELAY_MS = 200;
const DEFAULT_IMMEDIATE_THRESHOLD_MS = 1000;

async function _refreshReactorData(reactor: IReactorClient) {
  const drives = await getDrives(reactor);

  setDrives(drives);
}

async function _refreshReactorDataClient(reactor: IReactorClient | undefined) {
  if (!reactor) return;

  setDrives(await getDrives(reactor));
}

function createDebouncedRefreshReactorData(
  debounceDelayMs = DEFAULT_DEBOUNCE_DELAY_MS,
  immediateThresholdMs = DEFAULT_IMMEDIATE_THRESHOLD_MS,
) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastRefreshTime = 0;

  return (reactor: IReactorClient, immediate = false) => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;

    if (timeout !== null) {
      clearTimeout(timeout);
    }

    if (immediate || timeSinceLastRefresh >= immediateThresholdMs) {
      lastRefreshTime = now;
      return _refreshReactorData(reactor);
    }

    return new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        lastRefreshTime = Date.now();
        void _refreshReactorData(reactor).then(resolve);
      }, debounceDelayMs);
    });
  };
}

function createDebouncedRefreshReactorDataClient(
  debounceDelayMs = DEFAULT_DEBOUNCE_DELAY_MS,
  immediateThresholdMs = DEFAULT_IMMEDIATE_THRESHOLD_MS,
) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastRefreshTime = 0;

  return (reactor: IReactorClient | undefined, immediate = false) => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;

    if (timeout !== null) {
      clearTimeout(timeout);
    }

    if (immediate || timeSinceLastRefresh >= immediateThresholdMs) {
      lastRefreshTime = now;
      return _refreshReactorDataClient(reactor);
    }

    return new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        lastRefreshTime = Date.now();
        void _refreshReactorDataClient(reactor).then(resolve);
      }, debounceDelayMs);
    });
  };
}

export const refreshReactorData = createDebouncedRefreshReactorData();
export const refreshReactorDataClient =
  createDebouncedRefreshReactorDataClient();
