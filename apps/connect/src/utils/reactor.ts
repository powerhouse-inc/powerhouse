import { PGlite } from "@electric-sql/pglite";
import {
  ConsoleLogger,
  GqlChannelFactory,
  ReactorBuilder,
  ReactorClientBuilder,
  SyncBuilder,
  type Database,
  type SignerConfig,
} from "@powerhousedao/reactor";
import type { BrowserReactorClientModule } from "@powerhousedao/reactor-browser";
import {
  ConnectCryptoSigner,
  createSignatureVerifier,
  type IConnectCrypto,
} from "@renown/sdk";
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
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { createRemoveOldRemoteDrivesConfig } from "./drive-preservation.js";

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
  documentModels: DocumentModelModule<any>[],
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
export async function createBrowserReactor(
  documentModelModules: DocumentModelModule[],
  legacyStorage: IDocumentStorage & IDocumentOperationStorage,
  connectCrypto: IConnectCrypto,
): Promise<BrowserReactorClientModule> {
  const signerConfig: SignerConfig = {
    signer: new ConnectCryptoSigner(connectCrypto),
    verifier: createSignatureVerifier(),
  };

  const pg = new PGlite("idb://reactor", {
    relaxedDurability: true,
  });
  const logger = new ConsoleLogger(["reactor-client"]);
  const builder = new ReactorClientBuilder()
    .withLogger(logger)
    .withSigner(signerConfig)
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModels(documentModelModules)
        .withLegacyStorage(legacyStorage)
        .withSync(
          new SyncBuilder().withChannelFactory(new GqlChannelFactory(logger)),
        )
        .withFeatures({ legacyStorageEnabled: true })
        .withKysely(
          new Kysely<Database>({
            dialect: new PGliteDialect(pg),
          }),
        ),
    );

  const module = await builder.buildModule();
  return {
    ...module,
    pg,
  } as BrowserReactorClientModule;
}
