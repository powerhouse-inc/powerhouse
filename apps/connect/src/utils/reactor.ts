import {
  addDrive,
  addRemoteDrive,
  ChannelScheme,
  isDriveAuthError,
  ReactorBuilder,
  ReactorClientBuilder,
  setDriveMetadata,
  waitForDocumentReady,
  type BrowserReactorClientModule,
  type IDocumentModelLoader,
  type JwtHandler,
  type ReactorFeatureFlags,
} from "@powerhousedao/reactor-browser";
import {
  type GroupCommitPGliteInstance,
  PGLITE_IDB_STORAGE_FACTS,
  type UnsupportedStoredDocuments,
} from "@powerhousedao/reactor";
import type {
  PHConnectDefaultDrive,
  PHConnectDefaultDriveLocal,
  PHConnectDefaultDriveRemote,
} from "@powerhousedao/shared/clis";
import type { RuntimePowerhouseConfig } from "@powerhousedao/shared/connect";
import type {
  DocumentModelModule,
  SignaturePolicy,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { IRenown } from "@renown/sdk";
import { ConsoleLogger } from "document-model";
import { discardReactorPGlite, getReactorPGlite } from "../pglite.db.js";
import { reloadPageForPoisonedStore } from "./poisoned-store-budget.js";
import { toStoredDocumentsRefused } from "./stored-documents-refused.js";
import {
  createConnectSignerConfig,
  type RenownTrustEndpoints,
} from "./renown-trust.js";

/**
 * Creates a Reactor that plugs into legacy storage but syncs through the new
 * Reactor GQL API.
 */
export async function createBrowserReactor(
  documentModelModules: DocumentModelModule[],
  upgradeManifests: UpgradeManifest<readonly number[]>[],
  renown: IRenown,
  featureFlags: Partial<ReactorFeatureFlags>,
  documentModelLoader?: IDocumentModelLoader,
  createSignaturePolicy?: SignaturePolicy,
  renownEndpoints: RenownTrustEndpoints = {},
  unsupportedStoredDocuments?: UnsupportedStoredDocuments,
): Promise<BrowserReactorClientModule> {
  const signerConfig = await createConnectSignerConfig(
    renown.signer,
    featureFlags,
    renownEndpoints,
  );

  const jwtHandler: JwtHandler = async (_url: string) => {
    if (!renown.user) {
      return undefined;
    }
    // aud omitted: server verifies without an audience, so aud-bearing tokens
    // are rejected. Re-enable once both sides support audience restriction.
    return renown.getBearerToken({ expiresIn: 10 });
  };

  const pg = await getReactorPGlite();
  const logger = new ConsoleLogger(["reactor-client"]);
  const reactorBuilder = new ReactorBuilder()
    .withDocumentModelSources(documentModelModules)
    .withUpgradeManifests(upgradeManifests)
    .withChannelScheme(ChannelScheme.CONNECT)
    .withExecutorConfig({ featureFlags })
    .withJwtHandler(jwtHandler)
    .withGroupCommitPGlite({
      pg: pg as unknown as GroupCommitPGliteInstance,
      // A poisoned session's unflushed writes, and every position built on
      // them, are void: only a reload restarts them from the store.
      onUnrecoverable: reloadPageForPoisonedStore,
      onDiagnostic: (message, error) =>
        console.error(`[reactor] pglite: ${message}`, error),
    })
    .withStorageFacts(PGLITE_IDB_STORAGE_FACTS);
  const builder = new ReactorClientBuilder()
    .withLogger(logger)
    .withSigner(signerConfig)
    .withReactorBuilder(reactorBuilder);

  if (documentModelLoader) {
    builder.withDocumentModelLoader(documentModelLoader);
  }
  if (createSignaturePolicy) {
    builder.withCreateSignaturePolicy(createSignaturePolicy);
  }
  if (unsupportedStoredDocuments) {
    reactorBuilder.withUnsupportedStoredDocuments(unsupportedStoredDocuments);
  }

  let module: Awaited<ReturnType<typeof builder.buildModule>>;
  try {
    module = await builder.buildModule();
  } catch (error) {
    // The build leaves pg open; a retry must not reuse it.
    await discardReactorPGlite();
    throw toStoredDocumentsRefused(error);
  }
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
 * others — in particular the one the URL slug resolves to. Remote drives
 * retry with linear backoff to handle the common race where Connect's dev
 * server is ready before the switchboard has finished binding its port.
 *
 * Each entry is either a remote drive (a URL registered with the sync
 * manager, waited on for initial backfill) or a local drive (created once in
 * this browser's local reactor; its fixed id makes later boots skip it).
 *
 * @param drives - Array of default-drive entries
 */
export async function addDefaultDrivesForNewReactor(
  drives: PHConnectDefaultDrive[],
): Promise<void> {
  await Promise.all(
    drives.map((drive) =>
      "url" in drive
        ? addRemoteDefaultDrive(drive)
        : addLocalDefaultDrive(drive),
    ),
  );
}

async function addRemoteDefaultDrive(
  drive: PHConnectDefaultDriveRemote,
): Promise<void> {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = 2000;

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
      // waitForDocumentReady needs the full reactor client
      const reactorClient = window.ph?.reactorClientModule?.client;
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
}

/**
 * Create a configured local default drive in this browser's local reactor.
 * The drive is only created when the configured id is not already taken, so
 * repeated boots are idempotent and a drive the user deleted stays deleted.
 * Name and icon are written straight into the created document's global state
 * (no setDriveMetadata round-trip), and `app` maps to the drive's preferred
 * editor.
 */
async function addLocalDefaultDrive(
  drive: PHConnectDefaultDriveLocal,
): Promise<void> {
  // The union is discriminated on `url`, so a hand-edited config entry with
  // neither `url` nor `id` lands here. Without an id addDrive would mint a
  // random one, creating another drive on every boot.
  if (!drive.id) {
    console.error(
      "Ignoring local default drive with no id:",
      JSON.stringify(drive),
    );
    return;
  }

  try {
    // isDocumentIdTaken() lives on the full reactor client, not the browser
    // client the interactive addDrive action uses. It asks what the create
    // path asks — is the id reserved, deleted or not — where find() reports
    // only live documents, so a deleted drive would look absent and be
    // re-created (and rejected) on every boot.
    const reactorClient = window.ph?.reactorClientModule?.client;
    if (reactorClient) {
      const taken = await reactorClient.isDocumentIdTaken(drive.id);
      if (taken) {
        return; // created on an earlier boot, or deleted since
      }
    }
    await addDrive(
      {
        id: drive.id,
        global: {
          name: drive.name ?? "",
          icon: drive.icon ?? null,
        },
      },
      drive.app,
    );
  } catch (error) {
    console.error(`Failed to create local default drive ${drive.id}:`, error);
  }
}
