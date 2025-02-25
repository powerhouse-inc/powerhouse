import {
  BaseDocumentDriveServer,
  BaseQueueManager,
  BrowserStorage,
  DefaultRemoteDriveInput,
  DocumentDriveServerOptions,
  InMemoryCache,
  IReadModeDriveServer,
  ReactorBuilder,
} from "document-drive";
import { DocumentModelModule } from "document-model";

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
  documentModelModules: DocumentModelModule[],
  routerBasename: string,
  documentDriveServerOptions?: DocumentDriveServerOptions,
): BaseDocumentDriveServer & IReadModeDriveServer {
  const builder = new ReactorBuilder(documentModelModules)
    .withStorage(new BrowserStorage(routerBasename))
    .withCache(new InMemoryCache())
    .withQueueManager(new BaseQueueManager(1, 10));
  if (documentDriveServerOptions) {
    builder.withOptions(documentDriveServerOptions);
  }

  return builder.build() as unknown as BaseDocumentDriveServer &
    IReadModeDriveServer;
}
