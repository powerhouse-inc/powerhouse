import type { IReactorClient } from "@powerhousedao/reactor";
import type { IRenown } from "@renown/sdk";
import { BrowserKeyStorage, RenownCryptoBuilder } from "@renown/sdk";
import type {
  DefaultRemoteDriveInput,
  DocumentDriveDocument,
  DocumentDriveServerOptions,
  IDocumentDriveServer,
} from "document-drive";
import { generateId } from "document-model/core";
import { setDrives } from "./hooks/drives.js";
import { getDrives } from "./utils/drives.js";

export type ReactorDefaultDrivesConfig = {
  defaultDrivesUrl?: string[];
};

export const getReactorDefaultDrivesConfig = (
  config: ReactorDefaultDrivesConfig = {},
): Pick<DocumentDriveServerOptions, "defaultDrives"> => {
  const defaultDrivesUrl = config.defaultDrivesUrl || [];

  const remoteDrives: DefaultRemoteDriveInput[] = defaultDrivesUrl.map(
    (driveUrl) => ({
      url: driveUrl,
      options: {
        sharingType: "PUBLIC",
        availableOffline: true,
        listeners: [
          {
            block: true,
            callInfo: {
              data: driveUrl,
              name: "switchboard-push",
              transmitterType: "SwitchboardPush",
            },
            filter: {
              branch: ["main"],
              documentId: ["*"],
              documentType: ["*"],
              scope: ["global"],
            },
            label: "Switchboard Sync",
            listenerId: "1",
            system: true,
          },
        ],
        triggers: [],
      },
    }),
  );

  return {
    defaultDrives: {
      remoteDrives,
      removeOldRemoteDrives:
        defaultDrivesUrl.length > 0
          ? {
              strategy: "preserve-by-url-and-detach",
              urls: defaultDrivesUrl,
            }
          : { strategy: "preserve-all" },
    },
  };
};

export type RefreshReactorDataConfig = {
  debounceDelayMs?: number;
  immediateThresholdMs?: number;
};

const DEFAULT_DEBOUNCE_DELAY_MS = 200;
const DEFAULT_IMMEDIATE_THRESHOLD_MS = 1000;

async function _refreshReactorData(reactor: IDocumentDriveServer | undefined) {
  if (!reactor) return;
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

  return (reactor: IDocumentDriveServer | undefined, immediate = false) => {
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

export async function initLegacyReactor(
  legacyReactor: IDocumentDriveServer,
  renown: IRenown | undefined,
) {
  await initJwtHandler(legacyReactor, renown);
  const errors = await legacyReactor.initialize();
  const error = errors?.at(0);
  if (error) {
    throw error;
  }
}

export async function handleCreateFirstLocalDrive(
  reactor: IDocumentDriveServer | undefined,
  localDrivesEnabled = true,
) {
  if (!localDrivesEnabled || reactor === undefined) return;

  const drives = await getDrives(reactor);
  const hasDrives = drives.length > 0;
  if (hasDrives) return;

  const driveId = generateId();
  const driveSlug = `my-local-drive-${driveId}`;
  const document = await reactor.addDrive({
    id: driveId,
    slug: driveSlug,
    global: {
      name: "My Local Drive",
      icon: null,
    },
    local: {
      availableOffline: false,
      sharingType: "private",
      listeners: [],
      triggers: [],
    },
  });
  return document;
}

async function initJwtHandler(
  legacyReactor: IDocumentDriveServer,
  renown: IRenown | undefined,
) {
  let user = renown?.user;
  if (user instanceof Function) {
    user = await user();
  }
  if (!renown || !user) {
    return;
  }

  legacyReactor.setGenerateJwtHandler(async (driveUrl) => {
    return renown.getBearerToken({
      expiresIn: 10,
      aud: driveUrl,
    });
  });
}

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
