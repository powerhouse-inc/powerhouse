import { phGlobalConfigFromEnv } from "@powerhousedao/connect/config";
import { initFeatureFlags } from "@powerhousedao/connect/feature-flags.js";
import { toast } from "@powerhousedao/connect/services";
import {
  addDefaultDrivesForNewReactor,
  createBrowserReactor,
  getDefaultDrivesFromEnv,
} from "@powerhousedao/connect/utils";
import {
  addRemoteDrive,
  BrowserPackageManager,
  dropAllReactorStorage,
  extractDriveSlugFromPath,
  extractNodeSlugFromPath,
  getDrives,
  ReactorClientDocumentCache,
  refreshReactorDataClient,
  setFeatures,
  setPHToast,
  setSelectedDrive,
  setSelectedNode,
  setVetraPackageManager,
  type PHToastFn,
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
import {
  BrowserKeyStorage,
  RenownBuilder,
  RenownCryptoBuilder,
} from "@renown/sdk";
import { childLogger } from "document-drive";
import type { DocumentModelModule } from "document-model";
import { loadCommonPackage } from "./document-model.js";
import {
  createProcessorHostModule,
  ProcessorsManager,
} from "./processor-host-module.js";

const logger = childLogger(["connect", "reactor"]);

export async function clearReactorStorage() {
  const pg = window.ph?.reactorClientModule?.pg;
  if (!pg) {
    throw new Error("PGlite not found");
  }

  await dropAllReactorStorage(pg);

  await pg.close();
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

  // initialize package manager
  const packageManagerLogger = logger.child(["package-manager"]);
  const packageManager = new BrowserPackageManager(
    phGlobalConfigFromEnv.routerBasename ?? "",
    packageManagerLogger,
  );

  await packageManager.init();

  // add common package
  const commonPackage = await loadCommonPackage();
  await packageManager.addLocalPackage("common", commonPackage);

  setVetraPackageManager(packageManager);

  // get document models to set in the reactor (all versions)
  const documentModelModules = packageManager.packages
    .flatMap((pkg) => pkg.modules.documentModelModules)
    .filter((module) => module !== undefined);

  // get upgrade manifests from packages
  const upgradeManifests = packageManager.packages.flatMap(
    (pkg) => pkg.upgradeManifests,
  );

  // create reactor v2 with all versions and upgrade manifests
  const reactorClientModule = await createBrowserReactor(
    documentModelModules as unknown as DocumentModelModule[],
    upgradeManifests,
    renown,
  );

  // get the drives from the reactor
  const drives = await getDrives(reactorClientModule.client);

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
  setSelectedDrive(driveSlug);
  setSelectedNode(nodeSlug);
  setFeatures(features);

  // Add default drives for new reactor (after window.ph is set up)
  const defaultDrivesConfig = getDefaultDrivesFromEnv();
  if (defaultDrivesConfig.length > 0) {
    await addDefaultDrivesForNewReactor(defaultDrivesConfig);
  }

  // if remoteUrl is set and drive not already existing add remote drive and open it
  const remoteUrl = getDriveUrl();
  if (remoteUrl) {
    try {
      await addRemoteDrive(remoteUrl, {});
    } catch (error) {
      console.error(`Failed to add remote drive from ${remoteUrl}:`, error);
    }
  }

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

  // Setup processor factories and subscribe to package changes
  const processorHostModule = await createProcessorHostModule();
  if (processorHostModule !== undefined) {
    const processorsManager = new ProcessorsManager(
      reactorClientModule,
      processorHostModule,
      packageManager,
    );
    await processorsManager.init();
  }

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
