import { PGlite } from "@electric-sql/pglite";
import {
  addRemoteDrive,
  ChannelScheme,
  ReactorBuilder,
  ReactorClientBuilder,
  type BrowserReactorClientModule,
  type Database,
  type IDocumentModelLoader,
  type JwtHandler,
  type SignerConfig,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { createSignatureVerifier, type IRenown } from "@renown/sdk";
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
  documentModelLoader?: IDocumentModelLoader,
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
        .withChannelScheme(ChannelScheme.CONNECT)
        .withJwtHandler(jwtHandler)
        .withKysely(
          new Kysely<Database>({
            dialect: new PGliteDialect(pg),
          }),
        ),
    );

  if (documentModelLoader) {
    builder.withDocumentModelLoader(documentModelLoader);
  }

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
 *
 * Retries with linear backoff to handle the common race where Connect's
 * dev server is ready before the switchboard has finished binding its port.
 *
 * @param defaultDriveUrls - Array of drive REST endpoint URLs (e.g., "https://example.com/d/powerhouse")
 */
export async function addDefaultDrivesForNewReactor(
  defaultDriveUrls: string[],
): Promise<void> {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = 2000;

  for (const url of defaultDriveUrls) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await addRemoteDrive(url);
        break;
      } catch (error) {
        if (attempt === MAX_ATTEMPTS) {
          console.error(
            `Failed to add default drive ${url} after ${MAX_ATTEMPTS} attempts:`,
            error,
          );
        } else {
          const delay = BACKOFF_MS * attempt;
          console.warn(
            `Default drive ${url} not reachable (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }
}
