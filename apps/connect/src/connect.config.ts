import {
  setLogLevel,
  type PHAppConfig,
  type PHDocumentEditorConfig,
  type PHGlobalConfig,
} from "@powerhousedao/reactor-browser";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import {
  loadRuntimeEnv,
  normalizeBasePath,
} from "@powerhousedao/shared/connect";
import { logger } from "document-model";
import { getRuntimeConfig } from "./runtime-config.js";

// KEEP env vars stay in env: sentry config, version stamps, ga tracking,
// processor toggles, search/UI flags, etc. Anything NOT in the runtime
// schema (CONNECT-CONFIG.md §0.4 + CONNECT-ENV-AUDIT.md §A) reads from env
// at build-evaluation time, exactly as before.
export const env = loadRuntimeEnv({
  processEnv: import.meta.env,
});

// MIGRATE fields come from the runtime JSON, not env. start-connect.tsx's
// top-level await guarantees the loader cache is warm by the time this
// module evaluates, so getRuntimeConfig() resolves synchronously.
const runtime = getRuntimeConfig().connect;

function getRouterBasenameFromBasePath(basePath: string) {
  return basePath.endsWith("/") ? basePath : basePath + "/";
}

function getBuiltInDefaults(): Omit<
  PHGlobalConfig,
  "basePath" | "routerBasename"
> {
  return {
    allowList: undefined,
    allowedDocumentTypes: [],
    isDragAndDropEnabled: true,
    isEditorDebugModeEnabled: false,
    isEditorReadModeEnabled: false,
    isExternalControlsEnabled: false,
    version: env.PH_CONNECT_VERSION,
    logLevel: runtime.app?.logLevel ?? env.PH_CONNECT_LOG_LEVEL,
    requiresHardRefresh: env.PH_CONNECT_REQUIRES_HARD_REFRESH,
    warnOutdatedApp: env.PH_CONNECT_WARN_OUTDATED_APP,
    studioMode: env.PH_CONNECT_STUDIO_MODE,
    versionCheckInterval: env.PH_CONNECT_VERSION_CHECK_INTERVAL,
    cliVersion: env.PH_CONNECT_CLI_VERSION,
    fileUploadOperationsChunkSize:
      env.PH_CONNECT_FILE_UPLOAD_OPERATIONS_CHUNK_SIZE,
    gaTrackingId: env.PH_CONNECT_GA_TRACKING_ID,
    defaultDrivesUrl: runtime.drives?.defaultDrives?.[0]?.url,
    drivesPreserveStrategy:
      runtime.drives?.preserveStrategy ??
      env.PH_CONNECT_DRIVES_PRESERVE_STRATEGY,
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

    renownUrl: runtime.renown?.url ?? env.PH_CONNECT_RENOWN_URL,
    renownNetworkId:
      runtime.renown?.networkId ?? env.PH_CONNECT_RENOWN_NETWORK_ID,
    renownChainId: runtime.renown?.chainId ?? env.PH_CONNECT_RENOWN_CHAIN_ID,
    sentryRelease: env.PH_CONNECT_SENTRY_RELEASE,
    sentryDsn: env.PH_CONNECT_SENTRY_DSN,
    sentryEnv: env.PH_CONNECT_SENTRY_ENV,
    isDiffAnalyticsEnabled: env.PH_CONNECT_DIFF_ANALYTICS_ENABLED,
    isDriveAnalyticsEnabled: env.PH_CONNECT_DRIVE_ANALYTICS_ENABLED,
    isPublicDrivesEnabled:
      runtime.drives?.sections?.remote?.enabled ??
      env.PH_CONNECT_PUBLIC_DRIVES_ENABLED,
    isCloudDrivesEnabled:
      runtime.drives?.sections?.remote?.enabled ??
      env.PH_CONNECT_CLOUD_DRIVES_ENABLED,
    isLocalDrivesEnabled:
      runtime.drives?.sections?.local?.enabled ??
      env.PH_CONNECT_LOCAL_DRIVES_ENABLED,
    isSentryTracingEnabled: env.PH_CONNECT_SENTRY_TRACING_ENABLED,
    isDocumentModelSelectionSettingsEnabled:
      !env.PH_CONNECT_HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS,
    isAddDriveEnabled:
      runtime.drives?.allowAddDrive ?? !env.PH_CONNECT_DISABLE_ADD_DRIVE,
    isAddPublicDrivesEnabled:
      runtime.drives?.sections?.remote?.allowAdd ??
      !env.PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES,
    isDeletePublicDrivesEnabled:
      runtime.drives?.sections?.remote?.allowDelete ??
      !env.PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES,
    isAddCloudDrivesEnabled:
      runtime.drives?.sections?.remote?.allowAdd ??
      !env.PH_CONNECT_DISABLE_ADD_CLOUD_DRIVES,
    isDeleteCloudDrivesEnabled:
      runtime.drives?.sections?.remote?.allowDelete ??
      !env.PH_CONNECT_DISABLE_DELETE_CLOUD_DRIVES,
    isAddLocalDrivesEnabled:
      runtime.drives?.sections?.local?.allowAdd ??
      !env.PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES,
    isDeleteLocalDrivesEnabled:
      runtime.drives?.sections?.local?.allowDelete ??
      !env.PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES,
    isAnalyticsDatabaseWorkerEnabled:
      !env.PH_CONNECT_ANALYTICS_DATABASE_WORKER_DISABLED,
    isExternalPackagesEnabled:
      runtime.packages?.externalEnabled ??
      !env.PH_CONNECT_EXTERNAL_PACKAGES_DISABLED,
  };
}

export function buildPHGlobalConfig(
  basePath: string,
  routerBasename: string,
  connectFromConfig: PHConnectRuntimeConfig,
): PHGlobalConfig {
  const defaults = getBuiltInDefaults();
  const fileOverrides: Partial<PHGlobalConfig> = {};

  if (connectFromConfig.drives?.allowAddDrive !== undefined) {
    fileOverrides.isAddDriveEnabled = connectFromConfig.drives.allowAddDrive;
  }

  return {
    basePath,
    routerBasename,
    ...defaults,
    ...fileOverrides,
  };
}

function getPHGlobalConfigFromRuntime(): PHGlobalConfig {
  const basePath = runtime.app?.basePath ?? import.meta.env.BASE_URL;
  const routerBasename = getRouterBasenameFromBasePath(basePath);
  return buildPHGlobalConfig(basePath, routerBasename, runtime);
}

export const phGlobalConfig = getPHGlobalConfigFromRuntime();

export const defaultPHDocumentEditorConfig: PHDocumentEditorConfig = {
  isExternalControlsEnabled: phGlobalConfig.isExternalControlsEnabled,
};

export const defaultPHAppConfig: PHAppConfig = {
  allowedDocumentTypes: phGlobalConfig.allowedDocumentTypes,
  isDragAndDropEnabled: phGlobalConfig.isDragAndDropEnabled,
};

// Set log level from the resolved runtime config (with env fallback for the
// boot window between schema-default and operator override).
const RESOLVED_LOG_LEVEL = runtime.app?.logLevel ?? env.PH_CONNECT_LOG_LEVEL;
setLogLevel(RESOLVED_LOG_LEVEL);
logger.debug("Setting log level to @level.", RESOLVED_LOG_LEVEL);

// Normalize the base path to ensure it starts and ends with a forward slash
const PH_CONNECT_BASE_PATH = normalizeBasePath(
  runtime.app?.basePath ?? import.meta.env.BASE_URL,
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
  externalPackagesEnabled:
    runtime.packages?.externalEnabled ??
    !env.PH_CONNECT_EXTERNAL_PACKAGES_DISABLED,
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
    url: runtime.renown?.url ?? env.PH_CONNECT_RENOWN_URL,
    networkId: runtime.renown?.networkId ?? env.PH_CONNECT_RENOWN_NETWORK_ID,
    chainId: runtime.renown?.chainId ?? env.PH_CONNECT_RENOWN_CHAIN_ID,
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
  },
  drives: {
    addDriveEnabled:
      runtime.drives?.allowAddDrive ?? !env.PH_CONNECT_DISABLE_ADD_DRIVE,
    preserveStrategy:
      runtime.drives?.preserveStrategy ??
      env.PH_CONNECT_DRIVES_PRESERVE_STRATEGY,
    sections: {
      LOCAL: {
        enabled:
          runtime.drives?.sections?.local?.enabled ??
          env.PH_CONNECT_LOCAL_DRIVES_ENABLED,
        allowAdd:
          runtime.drives?.sections?.local?.allowAdd ??
          !env.PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES,
        allowDelete:
          runtime.drives?.sections?.local?.allowDelete ??
          !env.PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES,
      },
      CLOUD: {
        enabled:
          runtime.drives?.sections?.remote?.enabled ??
          env.PH_CONNECT_CLOUD_DRIVES_ENABLED,
        allowAdd:
          runtime.drives?.sections?.remote?.allowAdd ??
          !env.PH_CONNECT_DISABLE_ADD_CLOUD_DRIVES,
        allowDelete:
          runtime.drives?.sections?.remote?.allowDelete ??
          !env.PH_CONNECT_DISABLE_DELETE_CLOUD_DRIVES,
      },
      PUBLIC: {
        enabled:
          runtime.drives?.sections?.remote?.enabled ??
          env.PH_CONNECT_PUBLIC_DRIVES_ENABLED,
        allowAdd:
          runtime.drives?.sections?.remote?.allowAdd ??
          !env.PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES,
        allowDelete:
          runtime.drives?.sections?.remote?.allowDelete ??
          !env.PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES,
      },
    },
  },
  gaTrackingId: env.PH_CONNECT_GA_TRACKING_ID,
  phCliVersion: env.PH_CONNECT_CLI_VERSION,
  packagesRegistry: env.PH_CONNECT_PACKAGES_REGISTRY,
} as const;
