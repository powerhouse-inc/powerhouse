import {
  loadRuntimeEnv,
  normalizeBasePath,
} from "@powerhousedao/builder-tools/browser";
import { logger, setLogLevel } from "document-drive";

// Load environment variables with validation and defaults
const env = loadRuntimeEnv({
  processEnv: import.meta.env,
});

// Set log level from validated config
setLogLevel(env.PH_CONNECT_LOG_LEVEL);
logger.debug(`Setting log level to ${env.PH_CONNECT_LOG_LEVEL}.`);

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
  analytics: {
    databaseName: PH_CONNECT_ANALYTICS_DATABASE_NAME,
    useWorker: !env.PH_CONNECT_ANALYTICS_DATABASE_WORKER_DISABLED,
    driveAnalyticsEnabled: env.PH_CONNECT_DRIVE_ANALYTICS_ENABLED,
    diffProcessorEnabled: env.PH_CONNECT_DIFF_ANALYTICS_ENABLED,
    externalProcessorsEnabled: env.PH_CONNECT_EXTERNAL_PROCESSORS_ENABLED,
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
