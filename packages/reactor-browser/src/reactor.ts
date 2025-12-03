import type { IConnectCrypto, IRenown } from "@renown/sdk";
import { BrowserKeyStorage, ConnectCrypto } from "@renown/sdk";
import type {
  DefaultRemoteDriveInput,
  DocumentDriveServerOptions,
  IDocumentDriveServer,
} from "document-drive";
import type { PHDocument } from "document-model";
import { generateId } from "document-model/core";
import { setDrives } from "./hooks/drives.js";
import type {
  IDocumentCache,
  PromiseState,
  PromiseWithState,
} from "./types/documents.js";
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

export const refreshReactorData = createDebouncedRefreshReactorData();

export async function initLegacyReactor(
  legacyReactor: IDocumentDriveServer,
  renown: IRenown | undefined,
  connectCrypto: IConnectCrypto | undefined,
) {
  await initJwtHandler(legacyReactor, renown, connectCrypto);
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
  connectCrypto: IConnectCrypto | undefined,
) {
  let user = renown?.user;
  if (user instanceof Function) {
    user = await user();
  }
  if (!connectCrypto || !user) {
    return;
  }

  legacyReactor.setGenerateJwtHandler(async (driveUrl) => {
    return connectCrypto.getBearerToken(driveUrl, user.address, true, {
      expiresIn: 10,
    });
  });
}

export async function initConnectCrypto() {
  const connectCrypto = new ConnectCrypto(new BrowserKeyStorage());
  await connectCrypto.did();
  return connectCrypto;
}

export function readPromiseState<T>(
  promise: PromiseWithState<T>,
): PromiseState<T> {
  switch (promise.status) {
    case "pending":
      return { status: "pending" };
    case "fulfilled":
      return { status: "fulfilled", value: promise.value as T };
    case "rejected":
      return { status: "rejected", reason: promise.reason };
    default:
      promise.status = "pending";
      void promise.then((value) => {
        promise.status = "fulfilled";
        promise.value = value;
      });
      promise.catch((reason) => {
        promise.status = "rejected";
        promise.reason = reason;
      });
      return readPromiseState(promise);
  }
}

export function initDocumentCache(
  reactor: IDocumentDriveServer,
): IDocumentCache {
  const documents = new Map<string, Promise<PHDocument>>();

  reactor.on("documentDeleted", (documentId) => {
    documents.delete(documentId);
  });

  return {
    get(id: string, refetch?: boolean) {
      const currentData = documents.get(id);
      if (currentData) {
        // If pending then deduplicate requests
        if (readPromiseState(currentData).status === "pending") {
          return currentData;
        }
        // If not refetch then return current data
        if (!refetch) return currentData;
      }

      const documentPromise = reactor.getDocument(id);
      documents.set(id, documentPromise);
      return documentPromise;
    },
    subscribe(id: string | string[], callback: () => void) {
      const ids = Array.isArray(id) ? id : [id];
      return reactor.on("operationsAdded", (documentId) => {
        if (ids.includes(documentId)) {
          this.get(documentId, true)
            .then(() => callback())
            .catch(() => {
              console.warn("Failed to refetch document", documentId);
            });
        }
      });
    },
  };
}
