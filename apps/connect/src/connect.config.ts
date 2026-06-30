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

// Env vars are reserved for version stamps and analytics processor toggles.
// Everything in the Connect runtime schema (PHConnectRuntimeConfig) is read
// from `runtime` below. The Sentry release tag is stamped at build time via
// Vite's `define` so it always matches the sourcemap upload tag CI used.
export const env = loadRuntimeEnv({
  processEnv: import.meta.env,
});

declare const PH_CONNECT_SENTRY_RELEASE: string;

// Runtime fields come from the JSON, not env. start-connect.tsx's top-level
// await guarantees the loader cache is warm by the time this module
// evaluates, so getRuntimeConfig() resolves synchronously. The cache merges
// DEFAULT_CONNECT_CONFIG into whatever the file declared, so every leaf
// under `runtime.*` is guaranteed defined.
const runtime = getRuntimeConfig().connect;

function getRouterBasenameFromBasePath(basePath: string) {
  return basePath.endsWith("/") ? basePath : basePath + "/";
}

// Runtime deploy base. In dynamic-base builds the plugin rewrites
// import.meta.env.BASE_URL to (globalThis.__PH_DYNAMIC_BASE__||"/"), the same
// base assets resolve against; it takes precedence so router basename and
// path stripping match the served subpath. A baked runtime base path
// (runtime.app.basePath) only applies to concrete-base builds, where the
// dynamic global is unset.
function getDeployBasePath() {
  if (
    typeof globalThis !== "undefined" &&
    (globalThis as { __PH_DYNAMIC_BASE__?: string }).__PH_DYNAMIC_BASE__
  ) {
    return import.meta.env.BASE_URL;
  }
  return runtime.app?.basePath || import.meta.env.BASE_URL;
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
    // Analytics off by default; flip to true (or wire a runtime-config field)
    // when we want analytics enabled out of the box.
    isAnalyticsEnabled: false,
    isAnalyticsExternalProcessorsEnabled:
      env.PH_CONNECT_EXTERNAL_ANALYTICS_PROCESSORS_ENABLED,
    analyticsDatabaseName: undefined,
    isRelationalProcessorsEnabled: true,
    isExternalRelationalProcessorsEnabled: true,

    renownUrl: runtime.renown?.url,
    renownNetworkId: runtime.renown?.networkId,
    renownChainId: runtime.renown?.chainId,
    sentryRelease: PH_CONNECT_SENTRY_RELEASE,
    sentryDsn: runtime.sentry?.dsn ?? undefined,
    sentryEnv: runtime.sentry?.env,
    isDiffAnalyticsEnabled: env.PH_CONNECT_DIFF_ANALYTICS_ENABLED,
    isDriveAnalyticsEnabled: env.PH_CONNECT_DRIVE_ANALYTICS_ENABLED,
    isPublicDrivesEnabled: runtime.drives?.sections?.remote?.enabled,
    isCloudDrivesEnabled: runtime.drives?.sections?.remote?.enabled ?? true,
    isLocalDrivesEnabled: runtime.drives?.sections?.local?.enabled,
    isSentryTracingEnabled: runtime.sentry?.tracing,
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
  // Deploy base wins via getDeployBasePath: the dynamic-base global when set,
  // else runtime.app.basePath (DEFAULT_CONNECT_CONFIG guarantees it defined),
  // with a "/" fallback as a defensive guard for typecheck.
  const basePath = getDeployBasePath() ?? "/";
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

// Normalize the base path to ensure it starts and ends with a forward slash.
export const PH_CONNECT_BASE_PATH = normalizeBasePath(
  getDeployBasePath() ?? "/",
);

// Analytics database name — derived deterministically from the base path so
// instances on different prefixes of one origin do not share an analytics DB.
// Root resolves to ":analytics".
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
  offline: runtime.app?.offline ?? true,
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
  openPanel: {
    clientId: env.PH_CONNECT_OPENPANEL_CLIENT_ID ?? "",
    apiUrl: env.PH_CONNECT_OPENPANEL_API_URL,
    // Intentionally dormant — no call sites gate on this yet; UI-event tracking is future work.
    trackUiEvents: env.PH_CONNECT_OPENPANEL_TRACK_UI_EVENTS,
    trackOperations: env.PH_CONNECT_OPENPANEL_TRACK_OPERATIONS,
  },
  renown: {
    url: runtime.renown?.url,
    networkId: runtime.renown?.networkId,
    chainId: runtime.renown?.chainId,
  },
  sentry: {
    release: PH_CONNECT_SENTRY_RELEASE,
    // `dsn: null` (default) means Sentry is disabled — useInitSentry bails.
    dsn: runtime.sentry?.dsn ?? null,
    env: runtime.sentry?.env,
    tracing: runtime.sentry?.tracing ?? false,
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
