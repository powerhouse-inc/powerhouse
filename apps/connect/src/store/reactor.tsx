import connectConfig from "#connect-config";
import { createBrowserDocumentDriveServer, createBrowserStorage } from "#utils";
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
  initConnectCrypto,
  initReactor,
  login,
  refreshReactorData,
} from "@powerhousedao/reactor-browser";
import { initRenown } from "@renown/sdk";
import { logger } from "document-drive";
import { ProcessorManager } from "document-drive/processors/processor-manager";
import type { IDocumentAdminStorage } from "document-drive/storage/types";
import { loadCommonPackage } from "./document-model.js";
import { loadExternalPackages } from "./external-packages.js";

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
  const reactor = createBrowserDocumentDriveServer(
    documentModelModules,
    storage,
  );
  // initialize the reactor
  await initReactor(reactor, renown, connectCrypto);

  // create the processor manager
  const processorManager = new ProcessorManager(reactor.listeners, reactor);

  // get the drives from the reactor
  const drives = await getDrives(reactor);

  // if remoteUrl is set and drive not already existing add remote drive and open it

  // if remoteUrl is set and drive not already existing add remote drive and open it
  const remoteUrl = getRemoteUrl();
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
        listeners: [],
        availableOffline: false,
        sharingType: "PRIVATE",
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
  const allowList = getAllowList();
  const analyticsDatabaseName = connectConfig.analytics.databaseName;
  const showSearchBar = connectConfig.content.showSearchBar;
  return {
    allowList,
    analyticsDatabaseName,
    showSearchBar,
  };
}

function getAllowList() {
  const arbitrumAllowList = import.meta.env.PH_CONNECT_ARBITRUM_ALLOW_LIST;
  const rwaAllowList = import.meta.env.PH_CONNECT_RWA_ALLOW_LIST;
  if (!arbitrumAllowList.length && !rwaAllowList.length) {
    return undefined;
  }
  if (arbitrumAllowList.length) {
    return arbitrumAllowList.split(",").filter(Boolean);
  }
  if (rwaAllowList.length) {
    return rwaAllowList.split(",").filter(Boolean);
  }
  return undefined;
}

function getDidFromUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const didComponent = searchParams.get("user");
  const did = didComponent ? decodeURIComponent(didComponent) : undefined;
  return did;
}

function getRemoteUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const remoteUrl = searchParams.get("remoteUrl");
  const url = remoteUrl ? decodeURIComponent(remoteUrl) : undefined;
  return url;
}
