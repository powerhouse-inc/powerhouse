import {
  createBrowserDocumentDriveServer,
  createBrowserStorage,
  loadCommonPackage,
  loadExternalPackages,
} from "@powerhousedao/connect";
import { connectConfig } from "@powerhousedao/connect/config";
import {
  addPHEventHandlers,
  extractDriveSlugFromPath,
  extractNodeSlugFromPath,
  getDocuments,
  getDrives,
  getReactorDefaultDrivesConfig,
  initConnectCrypto,
  initReactor,
  login,
  refreshReactorData,
  setAllowList,
  setAnalyticsDatabaseName,
  setBasePath,
  setConnectCrypto,
  setDid,
  setDocuments,
  setDrives,
  setIsSearchBarEnabled,
  setProcessorManager,
  setReactor,
  setRenown,
  setSelectedDrive,
  setSelectedNode,
  setVetraPackages,
} from "@powerhousedao/reactor-browser";
import { initRenown } from "@renown/sdk";
import type {
  DocumentDriveDocument,
  IDocumentAdminStorage,
  IDocumentDriveServer,
} from "document-drive";
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
  if (window.ph.reactor || window.ph.loading) return;

  window.ph.loading = true;

  // add window event handlers for updates
  addPHEventHandlers();

  setBasePath(connectConfig.routerBasename);

  // initialize feature flags
  await initFeatureFlags();

  // initialize app config
  const { analyticsDatabaseName, allowList, isSearchBarEnabled } =
    getAppConfig();

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
  let drives = await getDrives(reactor);

  // if remoteUrl is set and drive not already existing add remote drive and open it
  const remoteUrl = getDriveUrl();
  const remoteDrive = remoteUrl
    ? await loadDriveFromRemoteUrl(remoteUrl, reactor, drives)
    : undefined;

  // if a remote drive was added then refetches the drives
  if (remoteDrive) {
    drives = await getDrives(reactor);
  }

  // get the documents from the reactor
  const documents = await getDocuments(reactor);

  // set the selected drive and node from the path
  const path = window.location.pathname;
  const driveSlug = remoteDrive?.header.slug ?? extractDriveSlugFromPath(path);
  const nodeSlug = !remoteDrive ? extractNodeSlugFromPath(path) : "";

  // initialize user
  const didFromUrl = getDidFromUrl();
  await login(didFromUrl, reactor, renown, connectCrypto);
  // dispatch the events to set the values in the window object
  setReactor(reactor);
  setConnectCrypto(connectCrypto);
  setDid(did);
  setRenown(renown);
  setAnalyticsDatabaseName(analyticsDatabaseName);
  setAllowList(allowList);
  setIsSearchBarEnabled(isSearchBarEnabled);
  setProcessorManager(processorManager);
  setDrives(drives);
  setDocuments(documents);
  setVetraPackages(vetraPackages);
  setSelectedDrive(driveSlug);
  setSelectedNode(nodeSlug);

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

  window.ph.loading = false;
}

function getAppConfig() {
  const analyticsDatabaseName = connectConfig.analytics.databaseName;
  const isSearchBarEnabled = connectConfig.content.showSearchBar;
  return {
    allowList: undefined,
    analyticsDatabaseName,
    isSearchBarEnabled,
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
