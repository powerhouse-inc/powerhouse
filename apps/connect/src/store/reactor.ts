import { phGlobalConfigFromEnv } from "@powerhousedao/connect/config";
import { toast } from "@powerhousedao/connect/services";
import {
  addDefaultDrivesForNewReactor,
  createBrowserReactor,
  getDefaultDrivesFromEnv,
  getDefaultRegistryCdnUrl,
} from "@powerhousedao/connect/utils";
import {
  addRemoteDrive,
  BrowserPackageLoader,
  BrowserPackageManager,
  convertLegacyLibToVetraPackage,
  DocumentChangeType,
  dropAllReactorStorage,
  extractDriveSlugFromPath,
  extractNodeSlugFromPath,
  getDrives,
  ReactorClientDocumentCache,
  refreshReactorDataClient,
  setBrowserPackageLoader,
  setFeatures,
  setPHToast,
  setSelectedDrive,
  setSelectedNode,
  setVetraPackageManager,
  type PHToastFn,
  type VetraPackage,
} from "@powerhousedao/reactor-browser";
import {
  addPHEventHandlers,
  login,
  setDefaultPHGlobalConfig,
  setDocumentCache,
  setDrives,
  setReactorClient,
  setReactorClientModule,
  setRenown,
} from "@powerhousedao/reactor-browser/connect";
import type { ProcessorFactoryBuilder } from "@powerhousedao/shared/processors";
import {
  BrowserKeyStorage,
  RenownBuilder,
  RenownCryptoBuilder,
} from "@renown/sdk";
import { logger } from "document-drive";
import type { DocumentModelModule } from "document-model";
import { initFeatureFlags } from "../feature-flags.js";
import { loadCommonPackage } from "./document-model.js";

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
  const packageManager = new BrowserPackageManager(
    phGlobalConfigFromEnv.routerBasename ?? "",
  );

  // add common package
  const commonPackage = await loadCommonPackage();
  await packageManager.addLocalPackage("common", commonPackage);

  // load external packages from virtual module if available
  try {
    const { loadExternalPackages } =
      await import("virtual:ph:external-packages");
    const externalPackages = await loadExternalPackages();
    for (let i = 0; i < externalPackages.length; i++) {
      const externalPkg = externalPackages[i];
      const vetraPackage = convertLegacyLibToVetraPackage(externalPkg);
      const name = externalPkg.manifest?.name || `external-${i}`;
      await packageManager.addLocalPackage(name, vetraPackage);
    }
  } catch {
    logger.info("No external packages to load");
  }

  // load packages from storage (persisted registry packages)
  await packageManager.init();

  setVetraPackageManager(packageManager);

  // get document models to set in the reactor (all versions)
  const documentModelModules = packageManager.packages
    .flatMap((pkg) => pkg.modules.documentModelModules)
    .filter(
      (module, index, modules) =>
        module !== undefined &&
        // deduplicate by documentType and version
        modules.findIndex(
          (m) =>
            m?.documentType === module.documentType &&
            m.version === module.version,
        ) === index,
    );

  // get upgrade manifests from packages
  const upgradeManifests = packageManager.packages.flatMap(
    (pkg) => pkg.upgradeManifests,
  );

  // Create browser package loader for dynamic package discovery
  const registryCdnUrl = getDefaultRegistryCdnUrl();
  let browserPackageLoader: BrowserPackageLoader | undefined;
  if (registryCdnUrl) {
    browserPackageLoader = new BrowserPackageLoader(
      packageManager,
      registryCdnUrl,
    );
  }

  // create reactor v2 with all versions and upgrade manifests
  const reactorClientModule = await createBrowserReactor(
    documentModelModules as unknown as DocumentModelModule[],
    upgradeManifests,
    renown,
    browserPackageLoader,
  );

  // Give loader access to registry (available after reactor creation)
  if (browserPackageLoader && reactorClientModule.reactorModule) {
    browserPackageLoader.setDocumentModelRegistry(
      reactorClientModule.reactorModule.documentModelRegistry,
    );
    setBrowserPackageLoader(browserPackageLoader);
  }

  // get the drives from the reactor
  const drives = await getDrives(reactorClientModule.client);

  // set the selected drive and node from the path
  const path = window.location.pathname;
  const driveSlug = extractDriveSlugFromPath(path);
  const nodeSlug = extractNodeSlugFromPath(path);

  // initialize user (automatically handles ?user= redirect from Renown portal)
  await login(undefined, renown);

  const documentCache = new ReactorClientDocumentCache(
    reactorClientModule.client,
  );

  // dispatch the events to set the values in the window object
  setDefaultPHGlobalConfig(phGlobalConfigFromEnv);
  setReactorClientModule(reactorClientModule);
  setReactorClient(reactorClientModule.client);
  setDocumentCache(documentCache);
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

  // Redirect when a currently-viewed document or drive is deleted remotely
  reactorClient.subscribe({}, (event) => {
    if (event.type !== DocumentChangeType.Deleted) return;
    const deletedId = event.context?.childId;
    if (!deletedId) return;

    const selectedDriveId = window.ph?.selectedDriveId;
    const selectedNodeId = window.ph?.selectedNodeId;

    if (selectedDriveId && deletedId === selectedDriveId) {
      setSelectedDrive(undefined);
      toast("The drive you were viewing has been deleted");
      return;
    }

    if (selectedNodeId && deletedId === selectedNodeId) {
      setSelectedNode(undefined);
      toast("The document you were editing has been deleted");
    }
  });

  // Refresh from ReactorClient to pick up any synced drives
  await refreshReactorDataClient(reactorClientModule.client);

  // Setup processor factories for packages that have them
  const packagesWithProcessorFactories = packageManager.packages.filter(
    (
      pkg,
    ): pkg is VetraPackage & { processorFactory: ProcessorFactoryBuilder } =>
      pkg.processorFactory !== undefined,
  );

  if (packagesWithProcessorFactories.length > 0) {
    const { createProcessorHostModule } =
      await import("./processor-host-module.js");
    const processorHostModule = await createProcessorHostModule();
    if (processorHostModule !== undefined) {
      await Promise.all(
        packagesWithProcessorFactories.map(async (pkg) => {
          const { id, name, processorFactory } = pkg;
          logger.info("Loading processor factory: @name", name);
          try {
            const factory = await processorFactory(processorHostModule);
            await reactorClientModule.reactorModule?.processorManager.registerFactory(
              id,
              factory,
            );
          } catch (error) {
            logger.error(`Error registering processor: @name`, name);
            logger.error("@error", error);
          }
        }),
      );
    }
  }

  window.ph.loading = false;
}

function getDriveUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const driveUrl = searchParams.get("driveUrl");
  const url = driveUrl ? decodeURIComponent(driveUrl) : undefined;
  return url;
}
