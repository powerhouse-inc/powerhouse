import {
  createBrowserDocumentDriveServer,
  createBrowserStorage,
  loadCommonPackage,
  loadExternalPackages,
} from "@powerhousedao/connect";
import { connectConfig, env } from "@powerhousedao/connect/config";
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
  setConnectCrypto,
  setDefaultPHGlobalConfig,
  setDid,
  setDocuments,
  setDrives,
  setProcessorManager,
  setReactor,
  setRenown,
  setSelectedDrive,
  setSelectedNode,
  setVetraPackages,
  type FullPHGlobalConfig,
  type PHGlobalConfig,
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

  const phGlobalConfigFromEnv = getPHGlobalConfigFromEnv();

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
  setDefaultPHGlobalConfig(phGlobalConfigFromEnv);
  setReactor(reactor);
  setConnectCrypto(connectCrypto);
  setDid(did);
  setRenown(renown);
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

function getRouterBasenameFromBasePath(basePath: string) {
  return basePath.endsWith("/") ? basePath : basePath + "/";
}

function getPHGlobalConfigFromEnv(): PHGlobalConfig {
  const basePath = env.PH_CONNECT_BASE_PATH || import.meta.env.BASE_URL;
  const routerBasename = getRouterBasenameFromBasePath(basePath);
  const config = {
    basePath,
    routerBasename,
    allowList: undefined,
    isDragAndDropEnabled: true,
    isDocumentToolbarEnabled: true,
    isSwitchboardLinkEnabled: true,
    isTimelineEnabled: false,
    isEditorDebugModeEnabled: false,
    isEditorReadModeEnabled: false,
    version: env.PH_CONNECT_VERSION,
    logLevel: env.PH_CONNECT_LOG_LEVEL,
    requiresHardRefresh: env.PH_CONNECT_REQUIRES_HARD_REFRESH,
    warnOutdatedApp: env.PH_CONNECT_WARN_OUTDATED_APP,
    studioMode: env.PH_CONNECT_STUDIO_MODE,
    versionCheckInterval: env.PH_CONNECT_VERSION_CHECK_INTERVAL,
    cliVersion: env.PH_CONNECT_CLI_VERSION,
    fileUploadOperationsChunkSize:
      env.PH_CONNECT_FILE_UPLOAD_OPERATIONS_CHUNK_SIZE,
    gaTrackingId: env.PH_CONNECT_GA_TRACKING_ID,
    defaultDrivesUrl: env.PH_CONNECT_DEFAULT_DRIVES_URL,
    drivesPreserveStrategy: env.PH_CONNECT_DRIVES_PRESERVE_STRATEGY,
    enabledEditors: env.PH_CONNECT_ENABLED_EDITORS?.split(","),
    disabledEditors: env.PH_CONNECT_DISABLED_EDITORS.split(","),
    analyticsDatabaseName: env.PH_CONNECT_ANALYTICS_DATABASE_NAME,
    renownUrl: env.PH_CONNECT_RENOWN_URL,
    renownNetworkId: env.PH_CONNECT_RENOWN_NETWORK_ID,
    renownChainId: env.PH_CONNECT_RENOWN_CHAIN_ID,
    sentryRelease: env.PH_CONNECT_SENTRY_RELEASE,
    sentryDsn: env.PH_CONNECT_SENTRY_DSN,
    sentryEnv: env.PH_CONNECT_SENTRY_ENV,
    isDiffAnalyticsEnabled: env.PH_CONNECT_DIFF_ANALYTICS_ENABLED,
    isDriveAnalyticsEnabled: env.PH_CONNECT_DRIVE_ANALYTICS_ENABLED,
    isPublicDrivesEnabled: env.PH_CONNECT_PUBLIC_DRIVES_ENABLED,
    isCloudDrivesEnabled: env.PH_CONNECT_CLOUD_DRIVES_ENABLED,
    localDrivesEnabled: env.PH_CONNECT_LOCAL_DRIVES_ENABLED,
    isSearchBarEnabled: env.PH_CONNECT_SEARCH_BAR_ENABLED,
    isSentryTracingEnabled: env.PH_CONNECT_SENTRY_TRACING_ENABLED,
    isExternalProcessorsEnabled: env.PH_CONNECT_EXTERNAL_PROCESSORS_ENABLED,
    isDocumentModelSelectionSettingsEnabled:
      !env.PH_CONNECT_HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS,
    isAddDriveEnabled: !env.PH_CONNECT_DISABLE_ADD_DRIVE,
    isAddPublicDrivesEnabled: !env.PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES,
    isDeletePublicDrivesEnabled: !env.PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES,
    isAddCloudDrivesEnabled: !env.PH_CONNECT_DISABLE_ADD_CLOUD_DRIVES,
    isDeleteCloudDrivesEnabled: !env.PH_CONNECT_DISABLE_DELETE_CLOUD_DRIVES,
    isAddLocalDrivesEnabled: !env.PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES,
    isDeleteLocalDrivesEnabled: !env.PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES,
    isExternalControlsEnabled: !env.PH_CONNECT_EXTERNAL_PACKAGES_DISABLED,
    isAnalyticsDatabaseWorkerEnabled:
      !env.PH_CONNECT_ANALYTICS_DATABASE_WORKER_DISABLED,
    isExternalPackagesEnabled: !env.PH_CONNECT_EXTERNAL_PACKAGES_DISABLED,
  } satisfies FullPHGlobalConfig;

  return config;
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
