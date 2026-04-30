import {
  addRemoteDrive,
  ChannelScheme,
  ReactorBuilder,
  ReactorClientBuilder,
  setDriveMetadata,
  type BrowserReactorClientModule,
  type Database,
  type IDocumentModelLoader,
  type JwtHandler,
  type SignerConfig,
} from "@powerhousedao/reactor-browser";
import type { PHConnectDefaultDrive } from "@powerhousedao/shared/clis";
import type { RuntimePowerhouseConfig } from "@powerhousedao/shared/connect";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { createSignatureVerifier, type IRenown } from "@renown/sdk";
import { ConsoleLogger } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import {
  detectReactorPgMajor,
  loadPGliteModule,
  resolvePgMajorForRuntime,
} from "./pglite-runtime.js";

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

  const detected = await detectReactorPgMajor();
  const major = resolvePgMajorForRuntime(detected);
  if (major !== 17) {
    console.warn(
      `[reactor] Running against legacy PGlite data dir (Postgres ${major}). Migrate to PG17 from the banner or the Inspector → Debug tab.`,
    );
  }
  const { PGlite } = await loadPGliteModule(major);
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
 * Parse default drives from runtime config, with env var override.
 * Env var (PH_CONNECT_DEFAULT_DRIVES_URL) wins when explicitly set.
 * Falls back to runtime config's connect.drives.defaultDrives.
 */
export function getDefaultDrives(
  runtimeConfig: RuntimePowerhouseConfig,
): PHConnectDefaultDrive[] {
  const envValue = import.meta.env.PH_CONNECT_DEFAULT_DRIVES_URL as
    | string
    | undefined;
  if (envValue) {
    return envValue
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url) => ({ url }));
  }
  return runtimeConfig.connect?.drives?.defaultDrives ?? [];
}

/**
 * Add default drives for the new reactor via sync manager.
 *
 * Retries with linear backoff to handle the common race where Connect's
 * dev server is ready before the switchboard has finished binding its port.
 *
 * @param drives - Array of drive objects with url, optional name and icon
 */
export async function addDefaultDrivesForNewReactor(
  drives: PHConnectDefaultDrive[],
): Promise<void> {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = 2000;

  for (const drive of drives) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const driveId = await addRemoteDrive(drive.url);
        if (drive.name || drive.icon) {
          await setDriveMetadata(driveId, {
            name: drive.name,
            icon: drive.icon,
          });
        }
        break;
      } catch (error) {
        if (attempt === MAX_ATTEMPTS) {
          console.error(
            `Failed to add default drive ${drive.url} after ${MAX_ATTEMPTS} attempts:`,
            error,
          );
        } else {
          const delay = BACKOFF_MS * attempt;
          console.warn(
            `Default drive ${drive.url} not reachable (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }
}
