import {
  BaseQueueManager,
  type DefaultRemoteDriveInput,
  type DocumentDriveServerOptions,
  type IDocumentDriveServer,
  InMemoryCache,
  ReactorBuilder,
} from "document-drive";
import { BrowserStorage } from "document-drive/storage/browser";
import { type DocumentModelModule } from "document-model";

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

export function createBrowserDocumentDriveServer(
  documentModelModules: DocumentModelModule[],
  routerBasename: string,
  documentDriveServerOptions?: DocumentDriveServerOptions,
): IDocumentDriveServer {
  const builder = new ReactorBuilder(documentModelModules)
    .withStorage(new BrowserStorage(routerBasename))
    .withCache(new InMemoryCache())
    .withQueueManager(new BaseQueueManager());

  if (documentDriveServerOptions) {
    builder.withOptions(documentDriveServerOptions);
  }

  return builder.build();
}
