import type { IReactorClient } from "@powerhousedao/reactor";
import { type DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { BrowserKeyStorage, RenownCryptoBuilder } from "@renown/sdk";
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

  const result = await reactor.find({ type: "powerhouse/document-drive" });
  setDrives(result.results as DocumentDriveDocument[]);
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

    // Clear any pending timeout
    if (timeout !== null) {
      clearTimeout(timeout);
    }

    // If caller requests immediate execution or enough time has passed, execute immediately
    if (immediate || timeSinceLastRefresh >= immediateThresholdMs) {
      lastRefreshTime = now;
      return _refreshReactorData(reactor);
    }

    // Otherwise, debounce the call
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

    // Clear any pending timeout
    if (timeout !== null) {
      clearTimeout(timeout);
    }

    // If caller requests immediate execution or enough time has passed, execute immediately
    if (immediate || timeSinceLastRefresh >= immediateThresholdMs) {
      lastRefreshTime = now;
      return _refreshReactorDataClient(reactor);
    }

    // Otherwise, debounce the call
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

/**
 * @deprecated Use {@link initRenownCrypto} instead
 *
 * Initialize ConnectCrypto
 * @returns ConnectCrypto instance
 */
export async function initConnectCrypto() {
  return initRenownCrypto();
}

/**
 * Initialize RenownCrypto
 * @returns RenownCrypto instance
 */
export async function initRenownCrypto() {
  const keyStorage = await BrowserKeyStorage.create();
  return await new RenownCryptoBuilder().withKeyPairStorage(keyStorage).build();
}
