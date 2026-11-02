import {
  addDrive,
  addRemoteDrive,
  getFullReactorClient,
  getPHStore,
  isDriveAuthError,
  ReactorBuilder,
  ReactorClientBuilder,
  setDriveMetadata,
  trackDriveArrival,
  untilDriveListed,
  waitForDocumentReady,
  type BrowserReactorClientModule,
  type IDocumentModelLoader,
  type JwtHandler,
  type ReactorFeatureFlags,
} from "@powerhousedao/reactor-browser";
import {
  type GroupCommitPGliteInstance,
  LocalChannelFactory,
  LocalChannelPortRegistry,
  PGLITE_IDB_STORAGE_FACTS,
  type UnsupportedStoredDocuments,
} from "@powerhousedao/reactor";
import {
  actionIdsFrom,
  caughtUp,
  type PlacementSync,
} from "@powerhousedao/connect-core/runtime";
import type { RoutingReactorClient } from "@powerhousedao/reactor-router";
import type {
  PHConnectDefaultDriveLocal,
  PHConnectDefaultDriveRemote,
  PHConnectRuntimeDefaultDrive,
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
import { configureConnectChannelScheme } from "./reactor-channel-scheme.js";
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
  multiReactor = false,
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
  // No brokered-port seam on the main thread, so the registry stays empty.
  configureConnectChannelScheme(reactorBuilder, {
    multiReactor,
    createLocalChannelFactory: () =>
      new LocalChannelFactory(
        logger,
        new LocalChannelPortRegistry({ logger }).provider,
      ),
  });
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
): PHConnectRuntimeDefaultDrive[] {
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
 * @returns The remote entries that were not added
 */
export async function addDefaultDrivesForNewReactor(
  drives: PHConnectRuntimeDefaultDrive[],
): Promise<PHConnectDefaultDriveRemote[]> {
  const missed = await Promise.all(
    drives.map(async (drive) => {
      if (!("url" in drive)) {
        await addLocalDefaultDrive(drive);
        return undefined;
      }
      return (await addRemoteDefaultDrive(drive)) ? undefined : drive;
    }),
  );
  return missed.filter((drive) => drive !== undefined);
}

/**
 * Adds the default drives, and again at sign-in those a signed-out person could
 * not reach. A host behind sign-in answers 404 for a drive it will not show, so
 * on a first run nothing can be added until the person has signed in, and
 * nothing else would ask again before a reload.
 *
 * Someone signed in from the start was already refused with their credentials:
 * signing in again cannot change that, so there is nothing to wait for.
 */
export async function addDefaultDrivesThroughSignIn(
  renown: Pick<IRenown, "on" | "user">,
  drives: PHConnectRuntimeDefaultDrive[],
): Promise<void> {
  const signedInAtStart = renown.user !== undefined;
  const missed = await addDefaultDrivesForNewReactor(drives);
  if (missed.length === 0 || signedInAtStart) return;

  const addMissed = () =>
    trackDriveArrival(addDefaultDrivesForNewReactor(missed));
  if (renown.user) {
    await addMissed();
    return;
  }
  const unsubscribe = renown.on("user", (user) => {
    if (!user) return;
    unsubscribe();
    addMissed().catch((error: unknown) =>
      console.error("Failed to add default drives after sign-in:", error),
    );
  });
}

/** @returns Whether the drive was added. */
async function addRemoteDefaultDrive(
  drive: PHConnectDefaultDriveRemote,
): Promise<boolean> {
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
  // Pending until listed: a finished first pull may not have listed it yet.
  const store = getPHStore();
  if (driveId && store) await untilDriveListed(store, driveId);

  if (driveId && (drive.name || drive.icon)) {
    try {
      // setDriveMetadata dispatches against the local drive document, which
      // only exists once initial backfill delivers it — wait for it first
      // so the name/icon override isn't lost to a sync race.
      // waitForDocumentReady needs the full reactor client
      const reactorClient = getFullReactorClient();
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
  return driveId !== undefined;
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
    const reactorClient = getFullReactorClient();
    if (reactorClient) {
      const taken = await reactorClient.write.isDocumentIdTaken(drive.id);
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

const COPY_TIMEOUT_MS = 30_000;
const COPY_RECHECK_MS = 250;

/** Adds what the copy here stored since the last read; false while it is not held here. */
async function readCopy(
  driveId: string,
  held: Record<string, Set<string>>,
  from: Record<string, number>,
): Promise<boolean> {
  const local = getPHStore()?.reactorClientModule?.client;
  if (!local) return false;
  try {
    for (const scope of Object.keys(held)) {
      const read = await actionIdsFrom(
        local.read,
        driveId,
        scope,
        from[scope] ?? 0,
      );
      for (const id of read.ids) held[scope].add(id);
      from[scope] = read.next;
    }
    return true;
  } catch {
    return false;
  }
}

/** Resolves once the local copy holds what the switchboard held when called; rejects after the timeout. */
async function untilCaughtUp(driveId: string, remote: string): Promise<void> {
  const router = getFullReactorClient() as
    | Pick<RoutingReactorClient, "backends">
    | undefined;
  const backend = router?.backends.find((b) => b.name === remote);
  if (!backend) {
    throw new Error(`No switchboard named ${remote} to copy from`);
  }
  const scopes = Object.keys((await backend.api.get(driveId)).header.revision);
  const source: Record<string, string[]> = {};
  const held: Record<string, Set<string>> = {};
  for (const scope of scopes) {
    source[scope] = (await actionIdsFrom(backend.api, driveId, scope, 0)).ids;
    held[scope] = new Set();
  }
  const from: Record<string, number> = {};
  const deadline = Date.now() + COPY_TIMEOUT_MS;
  for (;;) {
    if ((await readCopy(driveId, held, from)) && caughtUp(held, source)) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `The copy in this browser did not catch up with ${remote} within ${COPY_TIMEOUT_MS / 1000} s`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, COPY_RECHECK_MS));
  }
}

/** The tab's sync remotes, for moving a drive; a copy is ready once it holds what the switchboard holds. */
export function placementSync(): PlacementSync {
  const syncManager = () =>
    getPHStore()?.reactorClientModule?.reactorModule?.syncModule?.syncManager;
  return {
    list: () => syncManager()?.list() ?? [],
    remove: async (name) => {
      await syncManager()?.remove(name);
    },
    add: async (url, driveId) => {
      await addRemoteDrive(url, driveId);
    },
    untilCopied: (driveId, remote) => untilCaughtUp(driveId, remote),
  };
}
