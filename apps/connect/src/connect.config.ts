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

// KEEP env vars only: sentry config, version stamps, analytics toggles.
// Anything in the Connect runtime schema (PHConnectRuntimeConfig) is read
// from `runtime` below — env vars are NOT a layer for runtime values
// anymore. To change a runtime value use `ph connect build --<field>`,
// `ph connect config --<field>`, or edit `powerhouse.config.json` directly.
export const env = loadRuntimeEnv({
  processEnv: import.meta.env,
});

// Runtime fields come from the JSON, not env. start-connect.tsx's top-level
// await guarantees the loader cache is warm by the time this module
// evaluates, so getRuntimeConfig() resolves synchronously. The cache merges
// DEFAULT_CONNECT_CONFIG into whatever the file declared, so every leaf
// under `runtime.*` is guaranteed defined.
const runtime = getRuntimeConfig().connect;

function getRouterBasenameFromBasePath(basePath: string) {
  return basePath.endsWith("/") ? basePath : basePath + "/";
}

// Hardcoded literal defaults for `PHGlobalConfig` fields whose env-var
// source was removed. The fields stay on the type so wired-but-dead SW /
// hook consumers keep typechecking; values mirror the previous Zod
// defaults.
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
    logLevel: runtime.app?.logLevel,
    requiresHardRefresh: true,
    warnOutdatedApp: false,
    studioMode: false,
    versionCheckInterval: 60 * 60 * 1000,
    cliVersion: env.PH_CONNECT_CLI_VERSION,
    fileUploadOperationsChunkSize: 50,
    gaTrackingId: undefined,
    defaultDrivesUrl: runtime.drives?.defaultDrives?.[0]?.url,
    drivesPreserveStrategy: runtime.drives?.preserveStrategy,
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

    renownUrl: runtime.renown?.url,
    renownNetworkId: runtime.renown?.networkId,
    renownChainId: runtime.renown?.chainId,
    sentryRelease: env.PH_CONNECT_SENTRY_RELEASE,
    sentryDsn: env.PH_CONNECT_SENTRY_DSN,
    sentryEnv: env.PH_CONNECT_SENTRY_ENV,
    isDiffAnalyticsEnabled: env.PH_CONNECT_DIFF_ANALYTICS_ENABLED,
    isDriveAnalyticsEnabled: env.PH_CONNECT_DRIVE_ANALYTICS_ENABLED,
    isPublicDrivesEnabled: runtime.drives?.sections?.remote?.enabled,
    isCloudDrivesEnabled: runtime.drives?.sections?.remote?.enabled ?? true,
    isLocalDrivesEnabled: runtime.drives?.sections?.local?.enabled,
    isSentryTracingEnabled: env.PH_CONNECT_SENTRY_TRACING_ENABLED,
    isDocumentModelSelectionSettingsEnabled: false,
    isAddDriveEnabled: runtime.drives?.allowAddDrive,
    isAddPublicDrivesEnabled: runtime.drives?.sections?.remote?.allowAdd,
    isDeletePublicDrivesEnabled: runtime.drives?.sections?.remote?.allowDelete,
    isAddCloudDrivesEnabled: runtime.drives?.sections?.remote?.allowAdd ?? true,
    isDeleteCloudDrivesEnabled:
      runtime.drives?.sections?.remote?.allowDelete ?? true,
    isAddLocalDrivesEnabled: runtime.drives?.sections?.local?.allowAdd,
    isDeleteLocalDrivesEnabled: runtime.drives?.sections?.local?.allowDelete,
    isAnalyticsDatabaseWorkerEnabled: false,
    isExternalPackagesEnabled: runtime.packages?.externalEnabled,
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

// Set log level from the runtime config (DEFAULT_CONNECT_CONFIG provides a
// fallback, so this is always defined).
const RESOLVED_LOG_LEVEL = runtime.app?.logLevel;
if (RESOLVED_LOG_LEVEL) {
  setLogLevel(RESOLVED_LOG_LEVEL);
}
logger.debug("Setting log level to @level.", RESOLVED_LOG_LEVEL);

// Normalize the base path to ensure it starts and ends with a forward slash
const PH_CONNECT_BASE_PATH = normalizeBasePath(
  runtime.app?.basePath ?? import.meta.env.BASE_URL,
);

// Analytics database name — derived deterministically from the base path.
const PH_CONNECT_ANALYTICS_DATABASE_NAME = `${PH_CONNECT_BASE_PATH.replace(
  /\//g,
  "",
)}:analytics`;

// The CLOUD section was collapsed into the unified `remote` section. PUBLIC
// keeps its existing string identifier in the legacy
// connectConfig.drives.sections map to avoid rippling through downstream UI
// components — both PUBLIC and the
// soon-to-be-removed CLOUD readers point at runtime.drives.sections.remote.
export const connectConfig = {
  appVersion: env.PH_CONNECT_VERSION,
  studioMode: false,
  warnOutdatedApp: false,
  appVersionCheckInterval: 60 * 60 * 1000,
  routerBasename: PH_CONNECT_BASE_PATH,
  externalPackagesEnabled: runtime.packages?.externalEnabled,
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
    url: runtime.renown?.url,
    networkId: runtime.renown?.networkId,
    chainId: runtime.renown?.chainId,
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
    addDriveEnabled: runtime.drives?.allowAddDrive,
    preserveStrategy: runtime.drives?.preserveStrategy,
    // The legacy `SharingType` enum still includes a "CLOUD" variant.
    // Connect collapsed CLOUD into the unified remote section, so both CLOUD
    // and PUBLIC map to the same `runtime.drives.sections.remote` object —
    // the alias keeps `sections[sharingType]` lookups type-safe for every
    // SharingType value.
    sections: (() => {
      const remote = {
        enabled: runtime.drives?.sections?.remote?.enabled,
        allowAdd: runtime.drives?.sections?.remote?.allowAdd,
        allowDelete: runtime.drives?.sections?.remote?.allowDelete,
      };
      return {
        LOCAL: {
          enabled: runtime.drives?.sections?.local?.enabled,
          allowAdd: runtime.drives?.sections?.local?.allowAdd,
          allowDelete: runtime.drives?.sections?.local?.allowDelete,
        },
        PUBLIC: remote,
        CLOUD: remote,
      };
    })(),
  },
  gaTrackingId: undefined,
  phCliVersion: env.PH_CONNECT_CLI_VERSION,
} as const;
