import {
  addRemoteDrive,
  ChannelScheme,
  isDriveAuthError,
  ReactorBuilder,
  ReactorClientBuilder,
  setDriveMetadata,
  waitForDocumentReady,
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
import { REACTOR_PGLITE_NAME } from "./storage-namespace.js";

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

  const jwtHandler: JwtHandler = async (_url: string) => {
    if (!renown.user) {
      return undefined;
    }
    // aud omitted: server verifies without an audience, so aud-bearing tokens
    // are rejected. Re-enable once both sides support audience restriction.
    return renown.getBearerToken({ expiresIn: 10 });
  };

  const detected = await detectReactorPgMajor();
  const major = resolvePgMajorForRuntime(detected);
  if (major !== 17) {
    console.warn(
      `[reactor] Running against legacy PGlite data dir (Postgres ${major}). Migrate to PG17 from the banner or the Inspector → Debug tab.`,
    );
  }
  const { PGlite } = await loadPGliteModule(major);
  const pg = new PGlite(`idb://${REACTOR_PGLITE_NAME}`, {
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
    kind: "browser",
    reactorModule: module.reactorModule
      ? { ...module.reactorModule, pg }
      : undefined,
  };
}

export function getDefaultDrives(
  runtimeConfig: RuntimePowerhouseConfig,
): PHConnectDefaultDrive[] {
  return runtimeConfig.connect.drives?.defaultDrives ?? [];
}

/**
 * Add default drives for the new reactor via sync manager.
 *
 * Drives register concurrently so a slow or unreachable drive can't delay the
 * others — in particular the one the URL slug resolves to. Retries with linear
 * backoff to handle the common race where Connect's dev server is ready before
 * the switchboard has finished binding its port.
 *
 * @param drives - Array of drive objects with url, optional name and icon
 */
export async function addDefaultDrivesForNewReactor(
  drives: PHConnectDefaultDrive[],
): Promise<void> {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = 2000;

  await Promise.all(
    drives.map(async (drive) => {
      let driveId: string | undefined;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          driveId = await addRemoteDrive(drive.url);
          break;
        } catch (error) {
          if (isDriveAuthError(error)) {
            // addRemoteDrive already surfaces the login modal; auth failures
            // don't self-heal, so don't burn the remaining retries.
            break;
          }
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

      if (driveId && (drive.name || drive.icon)) {
        try {
          // setDriveMetadata dispatches against the local drive document, which
          // only exists once initial backfill delivers it — wait for it first
          // so the name/icon override isn't lost to a sync race.
          const reactorClient = window.ph?.reactorClient;
          if (reactorClient) {
            await waitForDocumentReady(reactorClient, driveId, {
              timeoutMs: 15_000,
            });
          }
          await setDriveMetadata(driveId, {
            name: drive.name,
            icon: drive.icon,
          });
        } catch (error) {
          console.warn(
            `Default drive ${drive.url} was added but metadata update failed:`,
            error,
          );
        }
      }
    }),
  );
}
