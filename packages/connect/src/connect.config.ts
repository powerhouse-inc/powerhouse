import { CLOUD, LOCAL, PUBLIC } from '@powerhousedao/design-system';
import { version } from '../package.json';

const APP_VERSION = import.meta.env.APP_VERSION || version;
const PH_CONNECT_STUDIO_MODE =
    import.meta.env.PH_CONNECT_STUDIO_MODE || 'false';

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

const PH_CONNECT_ROUTER_BASENAME =
    import.meta.env.PH_CONNECT_ROUTER_BASENAME || '/';

const PH_CONNECT_SENTRY_DSN = import.meta.env.PH_CONNECT_SENTRY_DSN || '';
const PH_CONNECT_SENTRY_ENV = import.meta.env.PH_CONNECT_SENTRY_ENV || 'dev';
const PH_CONNECT_SENTRY_TRACING_ENABLED =
    import.meta.env.PH_CONNECT_SENTRY_TRACING_ENABLED || 'false';

const GA_TRACKING_ID = import.meta.env.PH_CONNECT_GA_TRACKING_ID;

export default {
    appVersion: APP_VERSION,
    studioMode: PH_CONNECT_STUDIO_MODE.toString() === 'true',
    routerBasename: PH_CONNECT_ROUTER_BASENAME,
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
};