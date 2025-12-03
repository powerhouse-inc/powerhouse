import { phGlobalConfigFromEnv } from "@powerhousedao/connect/config";
import {
  initFeatureFlags,
  isDualActionCreateEnabled,
} from "@powerhousedao/connect/feature-flags.js";
import {
  createBrowserDocumentDriveServer,
  createBrowserReactor,
  createBrowserStorage,
} from "@powerhousedao/connect/utils";
import {
  extractDriveSlugFromPath,
  extractNodeSlugFromPath,
  getDrives,
  getReactorDefaultDrivesConfig,
  initConnectCrypto,
  initDocumentCache,
  initLegacyReactor,
  login,
  refreshReactorData,
  setSelectedDrive,
  setSelectedNode,
  setVetraPackages,
  type VetraPackage,
} from "@powerhousedao/reactor-browser";
import {
  addPHEventHandlers,
  setConnectCrypto,
  setDefaultPHGlobalConfig,
  setDid,
  setDocumentCache,
  setDrives,
  setLegacyReactor,
  setProcessorManager,
  setRenown,
} from "@powerhousedao/reactor-browser/connect";
import { initRenown } from "@renown/sdk";
import type {
  DocumentDriveDocument,
  IDocumentAdminStorage,
  IDocumentDriveServer,
} from "document-drive";
import { ProcessorManager, logger } from "document-drive";
import type { DocumentModelModule } from "document-model";
import { generateId } from "document-model/core";
import { loadCommonPackage } from "./document-model.js";
import {
  loadExternalPackages,
  subscribeExternalPackages,
} from "./external-packages.js";

let reactorStorage: IDocumentAdminStorage | undefined;

function setReactorStorage(storage: IDocumentAdminStorage) {
  reactorStorage = storage;
}

export async function clearReactorStorage() {
  await reactorStorage?.clear();
  return !!reactorStorage;
}

async function updateVetraPackages(externalPackages: VetraPackage[]) {
  const commonPackage = await loadCommonPackage();
  const packages = [commonPackage, ...externalPackages];
  setVetraPackages([commonPackage, ...externalPackages]);
  return packages;
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

  // initialize feature flags
  await initFeatureFlags();

  // initialize connect crypto
  const connectCrypto = await initConnectCrypto();

  // initialize did
  const did = await connectCrypto.did();

  // initialize renown
  const renown = initRenown(did, phGlobalConfigFromEnv.routerBasename);

  // initialize storage
  const storage = createBrowserStorage(phGlobalConfigFromEnv.routerBasename!);

  // store storage for admin access
  setReactorStorage(storage);

  // load vetra packages
  const externalPackages = await loadExternalPackages();
  const vetraPackages = await updateVetraPackages(externalPackages);
  subscribeExternalPackages(updateVetraPackages);

  // get document models to set in the reactor
  const documentModelModules = vetraPackages
    .flatMap((pkg) => pkg.modules.documentModelModules)
    .filter((module) => module !== undefined);

  // create the legacy reactor
  const dualActionCreateEnabled = await isDualActionCreateEnabled();
  const defaultConfig = getReactorDefaultDrivesConfig();
  const legacyReactor = createBrowserDocumentDriveServer(
    documentModelModules as unknown as DocumentModelModule[],
    storage,
    {
      ...defaultConfig,
      featureFlags: {
        enableDualActionCreate: dualActionCreateEnabled,
      },
    },
  );

  const reactor = await createBrowserReactor(documentModelModules, storage);

  // initialize the reactor
  await initLegacyReactor(legacyReactor, renown, connectCrypto);

  // initialize the document cache
  const documentCache = initDocumentCache(legacyReactor);

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

  // dispatch the events to set the values in the window object
  setDefaultPHGlobalConfig(phGlobalConfigFromEnv);
  setLegacyReactor(legacyReactor);
  setDocumentCache(documentCache);
  setConnectCrypto(connectCrypto);
  setDid(did);
  setRenown(renown);
  setProcessorManager(processorManager);
  setDrives(drives);
  setVetraPackages(vetraPackages);
  setSelectedDrive(driveSlug);
  setSelectedNode(nodeSlug);

  // subscribe to reactor events
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
