import { CLOUD, LOCAL, PUBLIC } from '@powerhousedao/design-system';
import { isLogLevel, logger, setLogLevel } from 'document-drive/utils/logger';
import pkg from '../package.json' with { type: 'json' };
import { getBasePath } from './utils/browser';

const version = pkg.version;
const APP_VERSION = import.meta.env.APP_VERSION || version;
const WARN_OUTDATED_APP =
    import.meta.env.PH_CONNECT_WARN_OUTDATED_APP || 'false';
const PH_CONNECT_STUDIO_MODE =
    import.meta.env.PH_CONNECT_STUDIO_MODE || 'false';

const DISABLE_ADD_DRIVE =
    import.meta.env.PH_CONNECT_DISABLE_ADD_DRIVE || 'false';
const DISABLE_ADD_PUBLIC_DRIVES =
    import.meta.env.PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES || undefined;
const DISABLE_ADD_CLOUD_DRIVES =
    import.meta.env.PH_CONNECT_DISABLE_ADD_CLOUD_DRIVES || undefined;
const DISABLE_ADD_LOCAL_DRIVES =
    import.meta.env.PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES || undefined;
const DISABLE_DELETE_PUBLIC_DRIVES =
    import.meta.env.PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES || undefined;
const DISABLE_DELETE_CLOUD_DRIVES =
    import.meta.env.PH_CONNECT_DISABLE_DELETE_CLOUD_DRIVES || undefined;
const DISABLE_DELETE_LOCAL_DRIVES =
    import.meta.env.PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES || undefined;

const LOCAL_DRIVES_ENABLED =
    import.meta.env.PH_CONNECT_LOCAL_DRIVES_ENABLED || undefined;
const CLOUD_DRIVES_ENABLED =
    import.meta.env.PH_CONNECT_CLOUD_DRIVES_ENABLED || undefined;
const PUBLIC_DRIVES_ENABLED =
    import.meta.env.PH_CONNECT_PUBLIC_DRIVES_ENABLED || undefined;

const SEARCH_BAR_ENABLED =
    import.meta.env.PH_CONNECT_SEARCH_BAR_ENABLED || undefined;

const HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS =
    import.meta.env.PH_CONNECT_HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS ||
    'false';

const PH_CONNECT_ROUTER_BASENAME = getBasePath() || '/';

const PH_CONNECT_SENTRY_DSN = import.meta.env.PH_CONNECT_SENTRY_DSN || '';
const PH_CONNECT_SENTRY_ENV = import.meta.env.PH_CONNECT_SENTRY_ENV || 'dev';
const PH_CONNECT_SENTRY_TRACING_ENABLED =
    import.meta.env.PH_CONNECT_SENTRY_TRACING_ENABLED || 'false';

const GA_TRACKING_ID = import.meta.env.PH_CONNECT_GA_TRACKING_ID;
const PH_CONNECT_CLI_VERSION =
    import.meta.env.PH_CONNECT_CLI_VERSION || undefined;

const PH_CONNECT_ANALYTICS_DATABASE_NAME =
    import.meta.env.PH_CONNECT_ANALYTICS_DATABASE_NAME ||
    `${PH_CONNECT_ROUTER_BASENAME.replace(/\//g, '')}:analytics`; // remove ending slash
const PH_CONNECT_ANALYTICS_DATABASE_WORKER_DISABLED =
    import.meta.env.PH_CONNECT_ANALYTICS_DATABASE_WORKER_DISABLED || 'false';

const PH_CONNECT_DIFF_ANALYTICS_ENABLED =
    import.meta.env.PH_CONNECT_DIFF_ANALYTICS_ENABLED || 'false';

const PH_CONNECT_DRIVE_ANALYTICS_ENABLED =
    import.meta.env.PH_CONNECT_DRIVE_ANALYTICS_ENABLED || 'false';

const PH_CONNECT_EXTERNAL_PROCESSORS_ENABLED =
    import.meta.env.PH_CONNECT_EXTERNAL_PROCESSORS_ENABLED || 'true';

const LOG_LEVEL = isLogLevel(import.meta.env.LOG_LEVEL)
    ? import.meta.env.LOG_LEVEL
    : 'info';
setLogLevel(LOG_LEVEL);
logger.debug(`Setting log level to ${import.meta.env.LOG_LEVEL}.`);

export default {
    appVersion: APP_VERSION,
    studioMode: PH_CONNECT_STUDIO_MODE.toString() === 'true',
    warnOutdatedApp: WARN_OUTDATED_APP === 'true',
    routerBasename: PH_CONNECT_ROUTER_BASENAME,
    analytics: {
        databaseName: PH_CONNECT_ANALYTICS_DATABASE_NAME,
        useWorker: PH_CONNECT_ANALYTICS_DATABASE_WORKER_DISABLED !== 'true',
        driveAnalyticsEnabled: PH_CONNECT_DRIVE_ANALYTICS_ENABLED === 'true',
        diffProcessorEnabled: PH_CONNECT_DIFF_ANALYTICS_ENABLED === 'true',
        externalProcessorsEnabled: PH_CONNECT_EXTERNAL_PROCESSORS_ENABLED === 'true',
    },
    sentry: {
        dsn: PH_CONNECT_SENTRY_DSN,
        env: PH_CONNECT_SENTRY_ENV,
        tracing: PH_CONNECT_SENTRY_TRACING_ENABLED === 'true',
    },
    content: {
        showSearchBar: SEARCH_BAR_ENABLED !== 'false',
        showDocumentModelSelectionSetting:
            HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS !== 'true',
    },
    drives: {
        addDriveEnabled: DISABLE_ADD_DRIVE === 'true' ? false : true,
        sections: {
            [LOCAL]: {
                enabled: LOCAL_DRIVES_ENABLED !== 'false',
                allowAdd: DISABLE_ADD_LOCAL_DRIVES !== 'true',
                allowDelete: DISABLE_DELETE_LOCAL_DRIVES !== 'true',
            },
            [CLOUD]: {
                enabled: CLOUD_DRIVES_ENABLED !== 'false',
                allowAdd: DISABLE_ADD_CLOUD_DRIVES !== 'true',
                allowDelete: DISABLE_DELETE_CLOUD_DRIVES !== 'true',
            },
            [PUBLIC]: {
                enabled: PUBLIC_DRIVES_ENABLED !== 'false',
                allowAdd: DISABLE_ADD_PUBLIC_DRIVES !== 'true',
                allowDelete: DISABLE_DELETE_PUBLIC_DRIVES !== 'true',
            },
        },
    },
    gaTrackingId: GA_TRACKING_ID,
    phCliVersion: PH_CONNECT_CLI_VERSION,
};
