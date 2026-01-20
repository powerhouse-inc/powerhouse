import { phGlobalConfigFromEnv } from "@powerhousedao/connect/config";
import { initFeatureFlags } from "@powerhousedao/connect/feature-flags.js";
import { toast } from "@powerhousedao/connect/services";
import {
  addDefaultDrivesForNewReactor,
  createBrowserDocumentDriveServer,
  createBrowserReactor,
  createBrowserStorage,
  getDefaultDrivesFromEnv,
} from "@powerhousedao/connect/utils";
import {
  DocumentCache,
  ReactorClientDocumentCache,
  truncateAllTables as dropAllTables,
  extractDriveSlugFromPath,
  extractNodeSlugFromPath,
  getDrives,
  getReactorDefaultDrivesConfig,
  initConnectCrypto,
  initLegacyReactor,
  login,
  refreshReactorData,
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
  setConnectCrypto,
  setDatabase,
  setDefaultPHGlobalConfig,
  setDid,
  setDocumentCache,
  setDrives,
  setLegacyReactor,
  setPGlite,
  setProcessorManager,
  setReactorClient,
  setReactorClientModule,
  setRenown,
  setSync,
} from "@powerhousedao/reactor-browser/connect";
import { initRenown } from "@renown/sdk";
import type {
  DocumentDriveDocument,
  DocumentDriveServerOptions,
  IDocumentAdminStorage,
  IDocumentDriveServer,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import { ProcessorManager, logger } from "document-drive";
import { generateId } from "document-model/core";
import { loadCommonPackage } from "./document-model.js";
import {
  loadExternalPackages,
  subscribeExternalPackages,
} from "./external-packages.js";

let reactorLegacyStorage: IDocumentAdminStorage | undefined;

function setLegacyReactorStorage(storage: IDocumentAdminStorage) {
  reactorLegacyStorage = storage;
}

export async function clearReactorStorage() {
  // clear legacy storage
  await reactorLegacyStorage?.clear();

  // clear all the reactor dependencies
  const pg = window.ph?.reactorClientModule?.pg;
  if (pg) {
    await dropAllTables(pg);
  }

  return !!reactorLegacyStorage;
}

async function updateVetraPackages(externalPackages: VetraPackage[]) {
  const commonPackage = await loadCommonPackage();
  const packages = [commonPackage, ...externalPackages];
  setVetraPackages([commonPackage, ...externalPackages]);
  return packages;
}

/**
 * Filters document model modules to only include the latest version of each document type.
 * This is needed for legacy reactor v1 which doesn't support multiple versions.
 */
function filterToLatestVersions(
  modules: DocumentModelModule[],
): DocumentModelModule[] {
  const latestByType = new Map<string, DocumentModelModule>();

  for (const module of modules) {
    const documentType = module.documentModel.global.id;
    const version =
      module.documentModel.global.specifications?.[0]?.version ?? 1;
    const existing = latestByType.get(documentType);
    const existingVersion =
      existing?.documentModel.global.specifications?.[0]?.version ?? 1;

    if (!existing || version > existingVersion) {
      latestByType.set(documentType, module);
    }
  }

  return Array.from(latestByType.values());
}

async function loadDriveFromRemoteUrl(
  remoteUrl: string,
  reactor: IDocumentDriveServer,
  drives: DocumentDriveDocument[],
): Promise<DocumentDriveDocument | undefined> {
  const driveFromRemoteUrl = drives.find((drive) =>
    drive.state.local.triggers.find(
      (trigger) =>
        trigger.type === "PullResponder" && trigger.data?.url === remoteUrl,
    ),
  );
  if (driveFromRemoteUrl) {
    return driveFromRemoteUrl;
  }
  try {
    const remoteDrive = await reactor.addRemoteDrive(remoteUrl, {
      sharingType: "PUBLIC",
      availableOffline: true,
      listeners: [
        {
          block: true,
          callInfo: {
            data: remoteUrl,
            name: "switchboard-push",
            transmitterType: "SwitchboardPush",
          },
          filter: {
            branch: ["main"],
            documentId: ["*"],
            documentType: ["*"],
            scope: ["global"],
          },
          label: "Switchboard Sync",
          listenerId: generateId(),
          system: true,
        },
      ],
      triggers: [],
    });
    return remoteDrive;
  } catch (error) {
    logger.error("Error adding remote drive", error);
  }
}

export async function createReactor() {
  if (!window.ph) {
    window.ph = {};
  }
  if (window.ph.legacyReactor || window.ph.loading) return;

  window.ph.loading = true;

  // add window event handlers for updates
  addPHEventHandlers();

  // register toast function for use in editor components
  setPHToast(toast as PHToastFn);

  // initialize feature flags
  const features = await initFeatureFlags();

  logger.info(
    `Features: ${JSON.stringify(Object.fromEntries(features), null, 2)}`,
  );

  // initialize connect crypto
  const connectCrypto = await initConnectCrypto();

  // initialize did
  const did = await connectCrypto.did();

  // initialize renown
  const renown = initRenown(did, phGlobalConfigFromEnv.routerBasename);

  // initialize storage
  const storage = createBrowserStorage(phGlobalConfigFromEnv.routerBasename!);

  // store storage for admin access
  setLegacyReactorStorage(storage);

  // load vetra packages
  const externalPackages = await loadExternalPackages();
  const vetraPackages = await updateVetraPackages(externalPackages);
  subscribeExternalPackages(updateVetraPackages);

  // get document models to set in the reactor (all versions)
  const documentModelModules = vetraPackages
    .flatMap((pkg) => pkg.modules.documentModelModules)
    .filter((module) => module !== undefined);

  // get upgrade manifests from packages
  const upgradeManifests = vetraPackages
    .flatMap((pkg) => pkg.upgradeManifests)
    .filter((manifest) => manifest !== undefined);

  // filter to latest versions for legacy reactor (doesn't support versioning)
  const latestModules = filterToLatestVersions(
    documentModelModules as unknown as DocumentModelModule[],
  );

  // Determine if we're using legacy reads before creating the reactor
  const useLegacyRead = features.get("FEATURE_LEGACY_READ_ENABLED") ?? true;

  // create the legacy reactor with only latest versions
  // Only include default drives config for legacy reactor when using legacy reads
  const legacyReactorOptions: DocumentDriveServerOptions = {
      featureFlags: {
        enableDualActionCreate: true,
      },
    };

  if (useLegacyRead) {
    const defaultConfig = getReactorDefaultDrivesConfig();
    Object.assign(legacyReactorOptions, defaultConfig);
  }

  const legacyReactor = createBrowserDocumentDriveServer(
    latestModules,
    storage,
    legacyReactorOptions,
  );

  // create reactor v2 with all versions and upgrade manifests
  const reactorClientModule = await createBrowserReactor(
    documentModelModules as unknown as DocumentModelModule[],
    upgradeManifests,
    storage,
    connectCrypto,
  );

  // Add default drives for new reactor if not using legacy read
  if (!useLegacyRead) {
    const defaultDrivesConfig = getDefaultDrivesFromEnv();
    if (defaultDrivesConfig.length > 0) {
      const syncManager =
        reactorClientModule.reactorModule?.syncModule?.syncManager;
      if (syncManager) {
        await addDefaultDrivesForNewReactor(syncManager, defaultDrivesConfig);
      }
    }
  }

  // initialize the reactor
  await initLegacyReactor(legacyReactor, renown, connectCrypto);

  // create the processor manager
  const processorManager = new ProcessorManager(
    legacyReactor.listeners,
    legacyReactor,
  );

  // get the drives from the reactor
  let drives = await getDrives(legacyReactor);

  // if remoteUrl is set and drive not already existing add remote drive and open it
  const remoteUrl = getDriveUrl();
  const remoteDrive = remoteUrl
    ? await loadDriveFromRemoteUrl(remoteUrl, legacyReactor, drives)
    : undefined;

  // if a remote drive was added then refetches the drives
  if (remoteDrive) {
    drives = await getDrives(legacyReactor);
  }

  // get the documents from the reactor

  // set the selected drive and node from the path
  const path = window.location.pathname;
  const driveSlug = remoteDrive?.header.slug ?? extractDriveSlugFromPath(path);
  const nodeSlug = !remoteDrive ? extractNodeSlugFromPath(path) : "";

  // initialize user
  const didFromUrl = getDidFromUrl();
  await login(didFromUrl, legacyReactor, renown, connectCrypto);

  // initialize the document cache based on feature flags
  const documentCache = useLegacyRead
    ? new DocumentCache(legacyReactor)
    : new ReactorClientDocumentCache(reactorClientModule.client);

  // dispatch the events to set the values in the window object
  setDefaultPHGlobalConfig(phGlobalConfigFromEnv);
  setLegacyReactor(legacyReactor);
  setReactorClientModule(reactorClientModule);
  setReactorClient(reactorClientModule.client);
  setSync(reactorClientModule.reactorModule?.syncModule?.syncManager);
  setDatabase(reactorClientModule.reactorModule?.database);
  setPGlite(reactorClientModule.pg);
  setDocumentCache(documentCache);
  setConnectCrypto(connectCrypto);
  setDid(did);
  setRenown(renown);
  setProcessorManager(processorManager);
  setDrives(drives);
  setVetraPackages(vetraPackages);
  setSelectedDrive(driveSlug);
  setSelectedNode(nodeSlug);
  setFeatures(features);

  // subscribe to reactor events based on feature flags
  if (useLegacyRead) {
    // Subscribe to legacy reactor events
    legacyReactor.on("defaultRemoteDrive", (...args) => {
      logger.verbose("defaultRemoteDrive", ...args);
      refreshReactorData(legacyReactor).catch(logger.error);
    });
    legacyReactor.on("clientStrandsError", (...args) => {
      logger.verbose("clientStrandsError", ...args);
      refreshReactorData(legacyReactor).catch(logger.error);
    });
    legacyReactor.on("driveAdded", (...args) => {
      logger.verbose("driveAdded", ...args);
      // register the drive with the processor manager
      processorManager.registerDrive(args[0].header.id).catch(logger.error);
      refreshReactorData(legacyReactor).catch(logger.error);
    });
    legacyReactor.on("driveDeleted", (...args) => {
      logger.verbose("driveDeleted", ...args);
      refreshReactorData(legacyReactor).catch(logger.error);
    });
    legacyReactor.on("documentModelModules", (...args) => {
      logger.verbose("documentModelModules", ...args);
      refreshReactorData(legacyReactor).catch(logger.error);
    });
    legacyReactor.on("driveOperationsAdded", (...args) => {
      logger.verbose("driveOperationsAdded", ...args);
      refreshReactorData(legacyReactor).catch(logger.error);
    });
  } else {
    legacyReactor.on("defaultRemoteDrive", (...args) => {
      logger.verbose("future:defaultRemoteDrive", ...args);

      refreshReactorDataClient(reactorClientModule.client).catch(logger.error);
    });
    legacyReactor.on("clientStrandsError", (...args) => {
      logger.verbose("future:clientStrandsError", ...args);

      refreshReactorDataClient(reactorClientModule.client).catch(logger.error);
    });
    legacyReactor.on("driveAdded", (...args) => {
      logger.verbose("future:driveAdded", ...args);
      // register the drive with the processor manager
      processorManager.registerDrive(args[0].header.id).catch(logger.error);

      refreshReactorDataClient(reactorClientModule.client).catch(logger.error);
    });
    legacyReactor.on("driveDeleted", (...args) => {
      logger.verbose("future:driveDeleted", ...args);

      refreshReactorDataClient(reactorClientModule.client).catch(logger.error);
    });
    legacyReactor.on("documentModelModules", (...args) => {
      logger.verbose("future:documentModelModules", ...args);

      refreshReactorDataClient(reactorClientModule.client).catch(logger.error);
    });
    legacyReactor.on("driveOperationsAdded", (...args) => {
      logger.verbose("future:driveOperationsAdded", ...args);

      refreshReactorDataClient(reactorClientModule.client).catch(logger.error);
    });

    // Subscribe via ReactorClient interface
    const reactorClient = reactorClientModule.client;
    reactorClient.subscribe({ type: "powerhouse/document-drive" }, (event) => {
      logger.verbose("ReactorClient subscription event", event);
      refreshReactorDataClient(reactorClientModule.client).catch(logger.error);
    });
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
