import { PGlite } from "@electric-sql/pglite";
import {
  ConsoleLogger,
  driveCollectionId,
  GqlChannelFactory,
  parseDriveUrl,
  ReactorBuilder,
  ReactorClientBuilder,
  SyncBuilder,
  type Database,
  type ISyncManager,
  type ParsedDriveUrl,
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
import type { DocumentModelModule, UpgradeManifest } from "document-model";
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
  upgradeManifests: UpgradeManifest<readonly number[]>[],
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
        .withUpgradeManifests(upgradeManifests)
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

/**
 * Parse default drives from environment variable.
 */
export function getDefaultDrivesFromEnv(): ParsedDriveUrl[] {
  const envValue = import.meta.env.PH_CONNECT_DEFAULT_DRIVES_URL as
    | string
    | undefined;
  if (!envValue) return [];
  return envValue
    .split(",")
    .filter((url) => url.trim().length > 0)
    .map(parseDriveUrl);
}

/**
 * Add default drives for the new reactor via sync manager.
 */
export async function addDefaultDrivesForNewReactor(
  sync: ISyncManager,
  defaultDrivesConfig: ParsedDriveUrl[],
): Promise<void> {
  for (const config of defaultDrivesConfig) {
    try {
      const remoteName = `default-drive-${config.driveId}`;
      await sync.add(remoteName, driveCollectionId("main", config.driveId), {
        type: "gql",
        parameters: { url: config.graphqlEndpoint },
      });
    } catch (error) {
      console.error(`Failed to add default drive ${config.url}:`, error);
    }
  }
}
