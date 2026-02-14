import { PGlite } from "@electric-sql/pglite";
import {
  ConsoleLogger,
  GqlChannelFactory,
  ReactorBuilder,
  ReactorClientBuilder,
  SyncBuilder,
  type Database,
  type JwtHandler,
  type SignerConfig,
} from "@powerhousedao/reactor";
import {
  addRemoteDrive,
  type BrowserReactorClientModule,
} from "@powerhousedao/reactor-browser";
import { createSignatureVerifier, type IRenown } from "@renown/sdk";
import type { DocumentModelModule, UpgradeManifest } from "document-model";
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
 * Returns an array of drive REST endpoint URLs (e.g., "https://example.com/d/powerhouse").
 */
export function getDefaultDrivesFromEnv(): string[] {
  const envValue = import.meta.env.PH_CONNECT_DEFAULT_DRIVES_URL as
    | string
    | undefined;
  if (!envValue) return [];
  return envValue.split(",").filter((url) => url.trim().length > 0);
}

/**
 * Add default drives for the new reactor via sync manager.
 * @param defaultDriveUrls - Array of drive REST endpoint URLs (e.g., "https://example.com/d/powerhouse")
 */
export async function addDefaultDrivesForNewReactor(
  defaultDriveUrls: string[],
): Promise<void> {
  for (const url of defaultDriveUrls) {
    try {
      await addRemoteDrive(url, {});
    } catch (error) {
      console.error(`Failed to add default drive ${url}:`, error);
    }
  }
}
