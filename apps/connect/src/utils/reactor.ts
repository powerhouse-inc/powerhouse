import { PGlite } from "@electric-sql/pglite";
import {
  type Database,
  GqlChannelFactory,
  ReactorBuilder,
  ReactorClientBuilder,
  SyncBuilder,
  type ReactorClientModule,
  type SignerConfig,
} from "@powerhousedao/reactor";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import type { IConnectCrypto } from "@renown/sdk";
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
  ReactorBuilder as LegacyReactorBuilder,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import { createRemoveOldRemoteDrivesConfig } from "./drive-preservation.js";
import { ConnectCryptoSigner, createSignatureVerifier } from "./signer.js";

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
  return new LegacyReactorBuilder(documentModels)
    .withStorage(storage)
    .withCache(new InMemoryCache())
    .withQueueManager(new EventQueueManager())
    .withOptions({
      ...options,
      ...getReactorDefaultDrivesConfig(),
    })
    .build();
}

/**
 * Creates a Reactor that plugs into legacy storage but syncs through the new
 * Reactor GQL API.
 */
export function createBrowserReactor(
  documentModelModules: DocumentModelModule[],
  legacyStorage: IDocumentStorage & IDocumentOperationStorage,
  connectCrypto: IConnectCrypto,
): Promise<ReactorClientModule> {
  const signerConfig: SignerConfig = {
    signer: new ConnectCryptoSigner(connectCrypto),
    verifier: createSignatureVerifier(),
  };
  const builder = new ReactorClientBuilder()
    .withSigner(signerConfig)
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModels(documentModelModules)
        .withLegacyStorage(legacyStorage)
        .withSync(new SyncBuilder().withChannelFactory(new GqlChannelFactory()))
        .withFeatures({ legacyStorageEnabled: true })
        .withKysely(
          new Kysely<Database>({
            dialect: new PGliteDialect(
              new PGlite("idb://reactor", {
                relaxedDurability: true,
              }),
            ),
          }),
        ),
    );

  return builder.buildModule();
}
