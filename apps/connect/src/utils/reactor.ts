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
  type JwtHandler,
  type ParsedDriveUrl,
  type SignerConfig,
} from "@powerhousedao/reactor";
import type { BrowserReactorClientModule } from "@powerhousedao/reactor-browser";
import { getReactorDefaultDrivesConfig as getReactorDefaultDrivesConfigBase } from "@powerhousedao/reactor-browser";
import { createSignatureVerifier, type IRenown } from "@renown/sdk";
import type {
  DocumentDriveServerOptions,
  IDocumentDriveServer,
} from "document-drive";
import {
  EventQueueManager,
  InMemoryCache,
  ReactorBuilder as LegacyReactorBuilder,
  MemoryStorage,
} from "document-drive";
import type { DocumentModelModule, UpgradeManifest } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { createRemoveOldRemoteDrivesConfig } from "./drive-preservation.js";

/**
 * Gets the default drives URLs from environment variable at call time.
 * This must be called at runtime, not at module initialization, because
 * the env var is set after the module is first imported during Vite dev server startup.
 */
function getDefaultDrivesUrlFromEnv(): string[] {
  const envValue = import.meta.env.PH_CONNECT_DEFAULT_DRIVES_URL as
    | string
    | undefined;
  if (!envValue) return [];
  return envValue.split(",").filter((url) => url.trim().length > 0);
}

/**
 * Gets the default drives config for Connect, reading URLs from PH_CONNECT_DEFAULT_DRIVES_URL
 * and using the Connect-specific preservation strategy from config.
 */
export const getReactorDefaultDrivesConfig = (): Pick<
  DocumentDriveServerOptions,
  "defaultDrives"
> => {
  // Read env var at call time, not at module initialization
  const defaultDrivesUrl = getDefaultDrivesUrlFromEnv();

  const baseConfig = getReactorDefaultDrivesConfigBase({
    defaultDrivesUrl,
  });

  // Override the removeOldRemoteDrives strategy with Connect-specific config
  return {
    defaultDrives: {
      ...baseConfig.defaultDrives,
      removeOldRemoteDrives:
        createRemoveOldRemoteDrivesConfig(defaultDrivesUrl),
    },
  };
};

export function createBrowserDocumentDriveServer(
  documentModels: DocumentModelModule<any>[],
  options: DocumentDriveServerOptions,
): IDocumentDriveServer {
  return new LegacyReactorBuilder(documentModels)
    .withStorage(new MemoryStorage())
    .withCache(new InMemoryCache())
    .withQueueManager(new EventQueueManager())
    .withOptions(options)
    .build();
}

/**
 * Creates a Reactor that plugs into legacy storage but syncs through the new
 * Reactor GQL API.
 */
export async function createBrowserReactor(
  documentModelModules: DocumentModelModule[],
  upgradeManifests: UpgradeManifest<readonly number[]>[],
  renown: IRenown,
): Promise<BrowserReactorClientModule> {
  const signerConfig: SignerConfig = {
    signer: renown.signer,
    verifier: createSignatureVerifier(),
  };

  const jwtHandler: JwtHandler = async (url: string) => {
    if (!renown.user) {
      return undefined;
    }
    return renown.getBearerToken({ expiresIn: 10, aud: url });
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
        .withSync(
          new SyncBuilder().withChannelFactory(
            new GqlChannelFactory(logger, jwtHandler),
          ),
        )
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
  const existingRemotes = sync.list();
  const existingRemoteNames = new Set(existingRemotes.map((r) => r.name));

  for (const config of defaultDrivesConfig) {
    try {
      const remoteName = `default-drive-${config.driveId}`;
      if (existingRemoteNames.has(remoteName)) {
        // Remote already exists, skip adding it
        continue;
      }
      await sync.add(remoteName, driveCollectionId("main", config.driveId), {
        type: "gql",
        parameters: { url: config.graphqlEndpoint },
      });
    } catch (error) {
      console.error(`Failed to add default drive ${config.url}:`, error);
    }
  }
}
