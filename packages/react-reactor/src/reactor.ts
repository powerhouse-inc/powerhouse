import InMemoryCache from "document-drive/cache/memory";
import { BaseQueueManager } from "document-drive/queue/base";
import {
  DefaultRemoteDriveInput,
  DocumentDriveServer,
  DocumentDriveServerOptions,
} from "document-drive/server";
import { BrowserStorage } from "document-drive/storage/browser";
import { DocumentModel } from "document-model/document";

// TODO: This should be configurable
const DEFAULT_DRIVES_URL: string | undefined =
  "https://apps.powerhouse.io/develop/powerhouse/switchboard/d/core-dev";

const defaultDrivesUrl = DEFAULT_DRIVES_URL
  ? DEFAULT_DRIVES_URL.split(",")
  : [];

export const getReactorDefaultDrivesConfig = (): Pick<
  DocumentDriveServerOptions,
  "defaultDrives"
> => {
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
        pullInterval: 3000,
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

export function createBrowserDocumentDriveServer(
  documentModels: DocumentModel[],
  routerBasename: string,
) {
  return new DocumentDriveServer(
    documentModels,
    new BrowserStorage(routerBasename),
    new InMemoryCache(),
    new BaseQueueManager(1, 10),
    { ...getReactorDefaultDrivesConfig() },
  );
}
