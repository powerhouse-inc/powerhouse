import {
  loadRuntimeEnv,
  normalizeBasePath,
} from "@powerhousedao/builder-tools/browser";
import type {
  FullPHGlobalConfig,
  PHDocumentEditorConfig,
  PHDriveEditorConfig,
  PHGlobalConfig,
} from "@powerhousedao/reactor-browser";
import { logger, setLogLevel } from "document-drive";

// Load environment variables with validation and defaults
export const env = loadRuntimeEnv({
  processEnv: import.meta.env,
});

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
    allowedDocumentTypes: [],
    isDragAndDropEnabled: true,
    isEditorDebugModeEnabled: false,
    isEditorReadModeEnabled: false,
    isExternalControlsEnabled: false,
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

    /* Processors */
    isExternalProcessorsEnabled: env.PH_CONNECT_EXTERNAL_PROCESSORS_ENABLED,
    isAnalyticsEnabled: env.PH_CONNECT_ANALYTICS_ENABLED,
    isAnalyticsExternalProcessorsEnabled:
      env.PH_CONNECT_EXTERNAL_PROCESSORS_ENABLED &&
      env.PH_CONNECT_EXTERNAL_ANALYTICS_PROCESSORS_ENABLED,
    analyticsDatabaseName: env.PH_CONNECT_ANALYTICS_DATABASE_NAME,
    isRelationalProcessorsEnabled: env.PH_CONNECT_RELATIONAL_PROCESSORS_ENABLED,
    isExternalRelationalProcessorsEnabled:
      env.PH_CONNECT_EXTERNAL_PROCESSORS_ENABLED &&
      env.PH_CONNECT_EXTERNAL_RELATIONAL_PROCESSORS_ENABLED,

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
    isLocalDrivesEnabled: env.PH_CONNECT_LOCAL_DRIVES_ENABLED,
    isSentryTracingEnabled: env.PH_CONNECT_SENTRY_TRACING_ENABLED,
    isDocumentModelSelectionSettingsEnabled:
      !env.PH_CONNECT_HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS,
    isAddDriveEnabled: !env.PH_CONNECT_DISABLE_ADD_DRIVE,
    isAddPublicDrivesEnabled: !env.PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES,
    isDeletePublicDrivesEnabled: !env.PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES,
    isAddCloudDrivesEnabled: !env.PH_CONNECT_DISABLE_ADD_CLOUD_DRIVES,
    isDeleteCloudDrivesEnabled: !env.PH_CONNECT_DISABLE_DELETE_CLOUD_DRIVES,
    isAddLocalDrivesEnabled: !env.PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES,
    isDeleteLocalDrivesEnabled: !env.PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES,
    isAnalyticsDatabaseWorkerEnabled:
      !env.PH_CONNECT_ANALYTICS_DATABASE_WORKER_DISABLED,
    isExternalPackagesEnabled: !env.PH_CONNECT_EXTERNAL_PACKAGES_DISABLED,
  } satisfies FullPHGlobalConfig;

  return config;
}

export const phGlobalConfigFromEnv = getPHGlobalConfigFromEnv();

export const defaultPHDocumentEditorConfig: PHDocumentEditorConfig = {
  isExternalControlsEnabled: phGlobalConfigFromEnv.isExternalControlsEnabled,
};

export const defaultPHDriveEditorConfig: PHDriveEditorConfig = {
  allowedDocumentTypes: phGlobalConfigFromEnv.allowedDocumentTypes,
  isDragAndDropEnabled: phGlobalConfigFromEnv.isDragAndDropEnabled,
};

// Set log level from validated config
setLogLevel(env.PH_CONNECT_LOG_LEVEL);
logger.debug("Setting log level to @level.", env.PH_CONNECT_LOG_LEVEL);

// Normalize the base path to ensure it starts and ends with a forward slash
const PH_CONNECT_BASE_PATH = normalizeBasePath(
  env.PH_CONNECT_BASE_PATH || import.meta.env.BASE_URL,
);

// Analytics database name with custom logic
const PH_CONNECT_ANALYTICS_DATABASE_NAME =
  env.PH_CONNECT_ANALYTICS_DATABASE_NAME ||
  `${PH_CONNECT_BASE_PATH.replace(/\//g, "")}:analytics`;

export const connectConfig = {
  appVersion: env.PH_CONNECT_VERSION,
  studioMode: env.PH_CONNECT_STUDIO_MODE,
  warnOutdatedApp: env.PH_CONNECT_WARN_OUTDATED_APP,
  appVersionCheckInterval: env.PH_CONNECT_VERSION_CHECK_INTERVAL,
  routerBasename: PH_CONNECT_BASE_PATH,
  externalPackagesEnabled: !env.PH_CONNECT_EXTERNAL_PACKAGES_DISABLED,
  processors: {
    enabled: env.PH_CONNECT_PROCESSORS_ENABLED,
    externalProcessorsEnabled: env.PH_CONNECT_EXTERNAL_PROCESSORS_ENABLED,
  },
  analytics: {
    enabled: env.PH_CONNECT_ANALYTICS_ENABLED,
    databaseName: PH_CONNECT_ANALYTICS_DATABASE_NAME,
    useWorker: !env.PH_CONNECT_ANALYTICS_DATABASE_WORKER_DISABLED,
    driveAnalyticsEnabled: env.PH_CONNECT_DRIVE_ANALYTICS_ENABLED,
    diffProcessorEnabled: env.PH_CONNECT_DIFF_ANALYTICS_ENABLED,
    externalProcessorsEnabled: env.PH_CONNECT_EXTERNAL_PROCESSORS_ENABLED,
  },
  relational: {
    enabled: env.PH_CONNECT_RELATIONAL_PROCESSORS_ENABLED,
    externalProcessorsEnabled:
      env.PH_CONNECT_EXTERNAL_RELATIONAL_PROCESSORS_ENABLED,
  },
  renown: {
    url: env.PH_CONNECT_RENOWN_URL,
    networkId: env.PH_CONNECT_RENOWN_NETWORK_ID,
    chainId: env.PH_CONNECT_RENOWN_CHAIN_ID,
  },
  sentry: {
    release: env.PH_CONNECT_SENTRY_RELEASE,
    dsn: env.PH_CONNECT_SENTRY_DSN,
    env: env.PH_CONNECT_SENTRY_ENV,
    tracing: env.PH_CONNECT_SENTRY_TRACING_ENABLED,
  },
  content: {
    showSearchBar: env.PH_CONNECT_SEARCH_BAR_ENABLED,
    showDocumentModelSelectionSetting:
      !env.PH_CONNECT_HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS,
    inspectorEnabled: env.PH_CONNECT_INSPECTOR_ENABLED,
  },
  drives: {
    addDriveEnabled: !env.PH_CONNECT_DISABLE_ADD_DRIVE,
    preserveStrategy: env.PH_CONNECT_DRIVES_PRESERVE_STRATEGY,
    sections: {
      LOCAL: {
        enabled: env.PH_CONNECT_LOCAL_DRIVES_ENABLED,
        allowAdd: !env.PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES,
        allowDelete: !env.PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES,
      },
      CLOUD: {
        enabled: env.PH_CONNECT_CLOUD_DRIVES_ENABLED,
        allowAdd: !env.PH_CONNECT_DISABLE_ADD_CLOUD_DRIVES,
        allowDelete: !env.PH_CONNECT_DISABLE_DELETE_CLOUD_DRIVES,
      },
      PUBLIC: {
        enabled: env.PH_CONNECT_PUBLIC_DRIVES_ENABLED,
        allowAdd: !env.PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES,
        allowDelete: !env.PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES,
      },
    },
  },
  gaTrackingId: env.PH_CONNECT_GA_TRACKING_ID,
  phCliVersion: env.PH_CONNECT_CLI_VERSION,
} as const;
