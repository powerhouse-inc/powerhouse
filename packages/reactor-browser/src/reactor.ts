import type { IConnectCrypto, IRenown } from "@renown/sdk";
import { BrowserKeyStorage, ConnectCrypto } from "@renown/sdk";
import type {
  DefaultRemoteDriveInput,
  DocumentDriveServerOptions,
  IDocumentDriveServer,
} from "document-drive";
import { generateId } from "document-model/core";
import { setDocuments } from "./hooks/documents.js";
import { setDrives } from "./hooks/drives.js";
import { getDocuments, getDrives } from "./utils/drives.js";

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

export async function refreshReactorData(
  reactor: IDocumentDriveServer | undefined,
) {
  if (!reactor) return;
  const drives = await getDrives(reactor);
  const documents = await getDocuments(reactor);
  setDrives(drives);
  setDocuments(documents);
}

export async function initReactor(
  reactor: IDocumentDriveServer,
  renown: IRenown | undefined,
  connectCrypto: IConnectCrypto | undefined,
) {
  await initJwtHandler(reactor, renown, connectCrypto);
  const errors = await reactor.initialize();
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
  reactor: IDocumentDriveServer,
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

  reactor.setGenerateJwtHandler(async (driveUrl) => {
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
