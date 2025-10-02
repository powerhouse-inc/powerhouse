import {
  createBrowserDocumentDriveServer,
  createBrowserStorage,
  loadCommonPackage,
  loadExternalPackages,
} from "@powerhousedao/connect";
import { connectConfig } from "@powerhousedao/connect/config";
import {
  addPHEventHandlers,
  dispatchSetAppConfigEvent,
  dispatchSetConnectCryptoEvent,
  dispatchSetDidEvent,
  dispatchSetDocumentsEvent,
  dispatchSetDrivesEvent,
  dispatchSetProcessorManagerEvent,
  dispatchSetReactorEvent,
  dispatchSetRenownEvent,
  dispatchSetSelectedDriveIdEvent,
  dispatchSetSelectedNodeIdEvent,
  dispatchSetVetraPackagesEvent,
  extractDriveSlugFromPath,
  extractNodeSlugFromPath,
  getDocuments,
  getDrives,
  getReactorDefaultDrivesConfig,
  initConnectCrypto,
  initReactor,
  login,
  refreshReactorData,
} from "@powerhousedao/reactor-browser";
import { initRenown } from "@renown/sdk";
import type { IDocumentAdminStorage } from "document-drive";
import { ProcessorManager, logger } from "document-drive";
import type { DocumentModelModule } from "document-model";
import { generateId } from "document-model/core";
import {
  initFeatureFlags,
  isDualActionCreateEnabled,
} from "../../feature-flags.js";

let reactorStorage: IDocumentAdminStorage | undefined;

function setReactorStorage(storage: IDocumentAdminStorage) {
  reactorStorage = storage;
}

export async function clearReactorStorage() {
  await reactorStorage?.clear();
  return !!reactorStorage;
}

async function loadVetraPackages() {
  const commonPackage = await loadCommonPackage();
  const externalPackages = await loadExternalPackages();
  return [commonPackage, ...externalPackages];
}

export async function createReactor() {
  if (window.reactor || window.loading) return;

  window.loading = true;

  // add window event handlers for updates
  addPHEventHandlers();

  // initialize feature flags
  await initFeatureFlags();

  // initialize app config
  const appConfig = getAppConfig();

  // initialize connect crypto
  const connectCrypto = await initConnectCrypto();

  // initialize did
  const did = await connectCrypto.did();

  // initialize renown
  const renown = initRenown(did, connectConfig.routerBasename);

  // initialize storage
  const storage = createBrowserStorage(connectConfig.routerBasename);

  // store storage for admin access
  setReactorStorage(storage);

  // load vetra packages
  const vetraPackages = await loadVetraPackages();

  // get document models to set in the reactor
  const documentModelModules = vetraPackages
    .flatMap((pkg) => pkg.modules.documentModelModules)
    .filter((module) => module !== undefined);

  // create the reactor
  const dualActionCreateEnabled = await isDualActionCreateEnabled();
  const defaultConfig = getReactorDefaultDrivesConfig();
  const reactor = createBrowserDocumentDriveServer(
    documentModelModules as unknown as DocumentModelModule[],
    storage,
    {
      ...defaultConfig,
      featureFlags: {
        enableDualActionCreate: dualActionCreateEnabled,
      },
    },
  );
  // initialize the reactor
  await initReactor(reactor, renown, connectCrypto);

  // create the processor manager
  const processorManager = new ProcessorManager(reactor.listeners, reactor);

  // get the drives from the reactor
  const drives = await getDrives(reactor);

  // if remoteUrl is set and drive not already existing add remote drive and open it

  // if remoteUrl is set and drive not already existing add remote drive and open it
  const remoteUrl = getDriveUrl();
  if (
    remoteUrl &&
    !drives.some(
      (drive) =>
        remoteUrl.includes(drive.header.slug) ||
        remoteUrl.includes(drive.header.id),
    )
  ) {
    try {
      await reactor.addRemoteDrive(remoteUrl, {
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
      window.location.href = "/d/" + remoteUrl.split("/").pop();
    } catch (error) {
      logger.error("Error adding remote drive", error);
    }
  } else if (remoteUrl) {
    window.location.href = "/d/" + remoteUrl.split("/").pop();
  }

  // get the documents from the reactor
  const documents = await getDocuments(reactor);

  // set the selected drive and node from the path
  const path = window.location.pathname;
  const driveSlug = extractDriveSlugFromPath(path);
  const nodeSlug = extractNodeSlugFromPath(path);

  // initialize user
  const didFromUrl = getDidFromUrl();
  await login(didFromUrl, reactor, renown, connectCrypto);
  // dispatch the events to set the values in the window object
  dispatchSetReactorEvent(reactor);
  dispatchSetConnectCryptoEvent(connectCrypto);
  dispatchSetDidEvent(did);
  dispatchSetRenownEvent(renown);
  dispatchSetAppConfigEvent(appConfig);
  dispatchSetProcessorManagerEvent(processorManager);
  dispatchSetDrivesEvent(drives);
  dispatchSetDocumentsEvent(documents);
  dispatchSetVetraPackagesEvent(vetraPackages);
  dispatchSetSelectedDriveIdEvent(driveSlug);
  dispatchSetSelectedNodeIdEvent(nodeSlug);

  // subscribe to reactor events
  reactor.on("syncStatus", (...args) => {
    logger.verbose("syncStatus", ...args);
    refreshReactorData(reactor).catch(logger.error);
  });
  reactor.on("strandUpdate", (...args) => {
    logger.verbose("strandUpdate", ...args);
    refreshReactorData(reactor).catch(logger.error);
  });
  reactor.on("defaultRemoteDrive", (...args) => {
    logger.verbose("defaultRemoteDrive", ...args);
    refreshReactorData(reactor).catch(logger.error);
  });
  reactor.on("clientStrandsError", (...args) => {
    logger.verbose("clientStrandsError", ...args);
    refreshReactorData(reactor).catch(logger.error);
  });
  reactor.on("driveAdded", (...args) => {
    logger.verbose("driveAdded", ...args);
    // register the drive with the processor manager
    processorManager.registerDrive(args[0].header.id).catch(logger.error);
    refreshReactorData(reactor).catch(logger.error);
  });
  reactor.on("driveDeleted", (...args) => {
    logger.verbose("driveDeleted", ...args);
    refreshReactorData(reactor).catch(logger.error);
  });
  reactor.on("documentModelModules", (...args) => {
    logger.verbose("documentModelModules", ...args);
    refreshReactorData(reactor).catch(logger.error);
  });
  reactor.on("documentOperationsAdded", (...args) => {
    logger.verbose("documentOperationsAdded", ...args);
    refreshReactorData(reactor).catch(logger.error);
  });
  reactor.on("driveOperationsAdded", (...args) => {
    logger.verbose("driveOperationsAdded", ...args);
    refreshReactorData(reactor).catch(logger.error);
  });
  reactor.on("operationsAdded", (...args) => {
    logger.verbose("operationsAdded", ...args);
    refreshReactorData(reactor).catch(logger.error);
  });

  window.loading = false;
}

function getAppConfig() {
  const analyticsDatabaseName = connectConfig.analytics.databaseName;
  const showSearchBar = connectConfig.content.showSearchBar;
  return {
    allowList: undefined,
    analyticsDatabaseName,
    showSearchBar,
  };
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
