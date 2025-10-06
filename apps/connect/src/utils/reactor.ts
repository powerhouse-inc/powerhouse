import { createRemoveOldRemoteDrivesConfig } from "@powerhousedao/connect";
import type {
  DefaultRemoteDriveInput,
  DocumentDriveServerOptions,
  IDocumentAdminStorage,
  IDocumentDriveServer,
  IDocumentOperationStorage,
  IDocumentStorage,
  IDriveOperationStorage,
} from "document-drive";
import {
  BrowserStorage,
  EventQueueManager,
  InMemoryCache,
  ReactorBuilder,
} from "document-drive";
import type { DocumentModelModule } from "document-model";

const DEFAULT_DRIVES_URL =
  (import.meta.env.PH_CONNECT_DEFAULT_DRIVES_URL as string | undefined) ||
  undefined;
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
      },
    }),
  );

  return {
    defaultDrives: {
      remoteDrives,
      removeOldRemoteDrives:
        createRemoveOldRemoteDrivesConfig(defaultDrivesUrl),
    },
  };
};

export function createBrowserStorage(
  routerBasename: string,
): IDriveOperationStorage &
  IDocumentOperationStorage &
  IDocumentStorage &
  IDocumentAdminStorage {
  return new BrowserStorage(routerBasename);
}

export function createBrowserDocumentDriveServer(
  documentModels: DocumentModelModule[],
  storage: IDriveOperationStorage,
  options: DocumentDriveServerOptions,
): IDocumentDriveServer {
  return new ReactorBuilder(documentModels)
    .withStorage(storage)
    .withCache(new InMemoryCache())
    .withQueueManager(new EventQueueManager())
    .withOptions({
      ...options,
      ...getReactorDefaultDrivesConfig(),
    })
    .build();
}
