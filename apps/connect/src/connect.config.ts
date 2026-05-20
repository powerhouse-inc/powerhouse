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

// Hardcoded literal defaults for fields whose env-var source was removed in
// task 14 (§2.3 REMOVE list). The fields themselves stay on PHGlobalConfig so
// the wired-but-dead SW/hook consumers keep typechecking; the values match
// the defaults the removed Zod schemas used to provide.
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
    requiresHardRefresh: true,
    warnOutdatedApp: false,
    studioMode: false,
    versionCheckInterval: 60 * 60 * 1000,
    cliVersion: env.PH_CONNECT_CLI_VERSION,
    fileUploadOperationsChunkSize: 50,
    gaTrackingId: undefined,
    defaultDrivesUrl: runtime.drives?.defaultDrives?.[0]?.url,
    drivesPreserveStrategy:
      runtime.drives?.preserveStrategy ??
      env.PH_CONNECT_DRIVES_PRESERVE_STRATEGY,
    enabledEditors: undefined,
    disabledEditors: ["powerhouse/document-drive"],

    /* Processors */
    isExternalProcessorsEnabled: true,
    isAnalyticsEnabled: true,
    isAnalyticsExternalProcessorsEnabled:
      env.PH_CONNECT_EXTERNAL_ANALYTICS_PROCESSORS_ENABLED,
    analyticsDatabaseName: undefined,
    isRelationalProcessorsEnabled: true,
    isExternalRelationalProcessorsEnabled: true,

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
    isCloudDrivesEnabled: runtime.drives?.sections?.remote?.enabled ?? true,
    isLocalDrivesEnabled:
      runtime.drives?.sections?.local?.enabled ??
      env.PH_CONNECT_LOCAL_DRIVES_ENABLED,
    isSentryTracingEnabled: env.PH_CONNECT_SENTRY_TRACING_ENABLED,
    isDocumentModelSelectionSettingsEnabled: false,
    isAddDriveEnabled:
      runtime.drives?.allowAddDrive ?? !env.PH_CONNECT_DISABLE_ADD_DRIVE,
    isAddPublicDrivesEnabled:
      runtime.drives?.sections?.remote?.allowAdd ??
      !env.PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES,
    isDeletePublicDrivesEnabled:
      runtime.drives?.sections?.remote?.allowDelete ??
      !env.PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES,
    isAddCloudDrivesEnabled: runtime.drives?.sections?.remote?.allowAdd ?? true,
    isDeleteCloudDrivesEnabled:
      runtime.drives?.sections?.remote?.allowDelete ?? true,
    isAddLocalDrivesEnabled:
      runtime.drives?.sections?.local?.allowAdd ??
      !env.PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES,
    isDeleteLocalDrivesEnabled:
      runtime.drives?.sections?.local?.allowDelete ??
      !env.PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES,
    isAnalyticsDatabaseWorkerEnabled: false,
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

// Analytics database name. Operator override via env was removed in task 14
// (§2.3) — this is now the deterministic default based on the base path.
const PH_CONNECT_ANALYTICS_DATABASE_NAME = `${PH_CONNECT_BASE_PATH.replace(
  /\//g,
  "",
)}:analytics`;

// task 14 §2.4: CLOUD section collapsed into the unified `remote` section
// (PH_CONNECT_CLOUD_DRIVES_* env vars removed). PUBLIC keeps its existing
// string identifier in the legacy connectConfig.drives.sections map to avoid
// rippling through downstream UI components — both PUBLIC and the
// soon-to-be-removed CLOUD readers point at runtime.drives.sections.remote.
export const connectConfig = {
  appVersion: env.PH_CONNECT_VERSION,
  studioMode: false,
  warnOutdatedApp: false,
  appVersionCheckInterval: 60 * 60 * 1000,
  routerBasename: PH_CONNECT_BASE_PATH,
  externalPackagesEnabled:
    runtime.packages?.externalEnabled ??
    !env.PH_CONNECT_EXTERNAL_PACKAGES_DISABLED,
  processors: {
    enabled: true,
    externalProcessorsEnabled: true,
  },
  analytics: {
    enabled: true,
    databaseName: PH_CONNECT_ANALYTICS_DATABASE_NAME,
    useWorker: false,
    driveAnalyticsEnabled: env.PH_CONNECT_DRIVE_ANALYTICS_ENABLED,
    diffProcessorEnabled: env.PH_CONNECT_DIFF_ANALYTICS_ENABLED,
    externalProcessorsEnabled: true,
  },
  relational: {
    enabled: true,
    externalProcessorsEnabled: true,
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
    showSearchBar: false,
    showDocumentModelSelectionSetting: false,
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
  gaTrackingId: undefined,
  phCliVersion: env.PH_CONNECT_CLI_VERSION,
  packagesRegistry: env.PH_CONNECT_PACKAGES_REGISTRY,
} as const;
