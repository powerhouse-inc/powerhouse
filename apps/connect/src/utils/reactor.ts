import { PGlite } from "@electric-sql/pglite";
import type {
  Database,
  ISyncManager,
  JwtHandler,
  ParsedDriveUrl,
  SignerConfig,
} from "@powerhousedao/reactor";
import type { BrowserReactorClientModule } from "@powerhousedao/reactor-browser";
import { driveCollectionId } from "@powerhousedao/reactor/cache/operation-index-types";
import { ReactorBuilder } from "@powerhousedao/reactor/core/reactor-builder";
import { ReactorClientBuilder } from "@powerhousedao/reactor/core/reactor-client-builder";
import { parseDriveUrl } from "@powerhousedao/reactor/shared/drive-url";
import { GqlChannelFactory } from "@powerhousedao/reactor/sync/channels/gql-channel-factory";
import { SyncBuilder } from "@powerhousedao/reactor/sync/sync-builder";
import { createSignatureVerifier, type IRenown } from "@renown/sdk";
import type { DocumentModelModule, UpgradeManifest } from "document-model";
import { ConsoleLogger } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";

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
