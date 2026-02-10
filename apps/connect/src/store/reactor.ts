import { phGlobalConfigFromEnv } from "@powerhousedao/connect/config";
import { initFeatureFlags } from "@powerhousedao/connect/feature-flags.js";
import { toast } from "@powerhousedao/connect/services";
import {
  addDefaultDrivesForNewReactor,
  createBrowserReactor,
  getDefaultDrivesFromEnv,
} from "@powerhousedao/connect/utils";
import {
  ReactorClientDocumentCache,
  dropAllReactorStorage,
  extractDriveSlugFromPath,
  extractNodeSlugFromPath,
  getDrives,
  refreshReactorDataClient,
  setFeatures,
  setPHToast,
  setSelectedDrive,
  setSelectedNode,
  setVetraPackages,
  type PHToastFn,
  type VetraPackage,
} from "@powerhousedao/reactor-browser";
import {
  addPHEventHandlers,
  login,
  setConnectCrypto,
  setDefaultPHGlobalConfig,
  setDid,
  setDocumentCache,
  setDrives,
  setReactorClient,
  setReactorClientModule,
  setRenown,
} from "@powerhousedao/reactor-browser/connect";
import { driveCollectionId } from "@powerhousedao/reactor/cache/operation-index-types";
import {
  BrowserKeyStorage,
  RenownBuilder,
  RenownCryptoBuilder,
} from "@renown/sdk";
import { logger } from "document-drive";
import type { DocumentModelModule } from "document-model";
import { loadCommonPackage } from "./document-model.js";
import {
  loadExternalPackages,
  subscribeExternalPackages,
} from "./external-packages.js";

export async function clearReactorStorage() {
  const pg = window.ph?.reactorClientModule?.pg;
  if (!pg) {
    throw new Error("PGlite not found");
  }

  await dropAllReactorStorage(pg);

  await pg.close();
}

async function updateVetraPackages(externalPackages: VetraPackage[]) {
  const commonPackage = await loadCommonPackage();
  const packages = [commonPackage, ...externalPackages];
  setVetraPackages([commonPackage, ...externalPackages]);
  return packages;
}

export async function createReactor() {
  if (!window.ph) {
    window.ph = {};
  }
  if (window.ph.loading) return;

  window.ph.loading = true;

  // add window event handlers for updates
  addPHEventHandlers();

  // register toast function for use in editor components
  setPHToast(toast as PHToastFn);

  // initialize feature flags
  const features = await initFeatureFlags();

  logger.info(
    "Features: @features",
    JSON.stringify(Object.fromEntries(features), null, 2),
  );

  // initialize renown crypto
  const keyPairStorage = await BrowserKeyStorage.create();
  const renownCrypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(keyPairStorage)
    .build();

  // initialize Renown
  const renown = await new RenownBuilder("connect", {
    basename: phGlobalConfigFromEnv.routerBasename,
    baseUrl: phGlobalConfigFromEnv.renownUrl,
  })
    .withCrypto(renownCrypto)
    .build();

  // load vetra packages
  const externalPackages = await loadExternalPackages();
  const vetraPackages = await updateVetraPackages(externalPackages);
  subscribeExternalPackages(updateVetraPackages);

  // get document models to set in the reactor (all versions)
  const documentModelModules = vetraPackages
    .flatMap((pkg) => pkg.modules.documentModelModules)
    .filter((module) => module !== undefined);

  // get upgrade manifests from packages
  const upgradeManifests = vetraPackages.flatMap((pkg) => pkg.upgradeManifests);

  // create reactor v2 with all versions and upgrade manifests
  const reactorClientModule = await createBrowserReactor(
    documentModelModules as unknown as DocumentModelModule[],
    upgradeManifests,
    renown,
  );

  // Add default drives for new reactor
  const defaultDrivesConfig = getDefaultDrivesFromEnv();
  if (defaultDrivesConfig.length > 0) {
    const syncManager =
      reactorClientModule.reactorModule?.syncModule?.syncManager;
    if (syncManager) {
      await addDefaultDrivesForNewReactor(syncManager, defaultDrivesConfig);
    }
  }

  // get the drives from the reactor
  const drives = await getDrives(reactorClientModule.client);

  // if remoteUrl is set and drive not already existing add remote drive and open it
  const remoteUrl = getDriveUrl();
  if (remoteUrl) {
    // Extract driveId from URL (e.g., "http://localhost:4001/d/abc123" -> "abc123")
    const driveId = remoteUrl.split("/").pop() ?? "";
    await reactorClientModule.reactorModule?.syncModule?.syncManager.add(
      `remote-drive-${driveId}`,
      driveCollectionId("main", driveId),
      {
        type: "gql",
        parameters: { url: remoteUrl },
      },
    );
  }

  // set the selected drive and node from the path
  const path = window.location.pathname;
  const driveSlug = extractDriveSlugFromPath(path);
  const nodeSlug = extractNodeSlugFromPath(path);

  // initialize user from URL parameter
  const didFromUrl = getDidFromUrl();
  await login(didFromUrl, renown);

  const documentCache = new ReactorClientDocumentCache(
    reactorClientModule.client,
  );

  // dispatch the events to set the values in the window object
  setDefaultPHGlobalConfig(phGlobalConfigFromEnv);
  setReactorClientModule(reactorClientModule);
  setReactorClient(reactorClientModule.client);
  setDocumentCache(documentCache);
  setConnectCrypto(renownCrypto);
  setDid(renown.did);
  setRenown(renown);
  setDrives(drives);
  setVetraPackages(vetraPackages);
  setSelectedDrive(driveSlug);
  setSelectedNode(nodeSlug);
  setFeatures(features);

  // Subscribe via ReactorClient interface
  const reactorClient = reactorClientModule.client;
  reactorClient.subscribe({ type: "powerhouse/document-drive" }, (event) => {
    logger.verbose("ReactorClient subscription event: @event", event);
    refreshReactorDataClient(reactorClientModule.client).catch((e) =>
      logger.error("@error", e),
    );
  });

  // Refresh from ReactorClient to pick up any synced drives
  await refreshReactorDataClient(reactorClientModule.client);

  window.ph.loading = false;
}

function getDidFromUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const didComponent = searchParams.get("user");
  const did = didComponent ? decodeURIComponent(didComponent) : undefined;
  return did;
}

function getDriveUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const driveUrl = searchParams.get("driveUrl");
  const url = driveUrl ? decodeURIComponent(driveUrl) : undefined;
  return url;
}
