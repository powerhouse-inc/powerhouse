const DISABLE_ADD_PUBLIC_DRIVES =
    import.meta.env.VITE_DISABLE_ADD_PUBLIC_DRIVES || undefined;
const DISABLE_ADD_CLOUD_DRIVES =
    import.meta.env.VITE_DISABLE_ADD_CLOUD_DRIVES || undefined;
const DISABLE_ADD_LOCAL_DRIVES =
    import.meta.env.VITE_DISABLE_ADD_LOCAL_DRIVES || undefined;
const DISABLE_DELETE_PUBLIC_DRIVES =
    import.meta.env.VITE_DISABLE_DELETE_PUBLIC_DRIVES || undefined;
const DISABLE_DELETE_CLOUD_DRIVES =
    import.meta.env.VITE_DISABLE_DELETE_CLOUD_DRIVES || undefined;
const DISABLE_DELETE_LOCAL_DRIVES =
    import.meta.env.VITE_DISABLE_DELETE_LOCAL_DRIVES || undefined;

const LOCAL_DRIVES_ENABLED =
    import.meta.env.VITE_LOCAL_DRIVES_ENABLED || undefined;
const CLOUD_DRIVES_ENABLED =
    import.meta.env.VITE_CLOUD_DRIVES_ENABLED || undefined;
const PUBLIC_DRIVES_ENABLED =
    import.meta.env.VITE_PUBLIC_DRIVES_ENABLED || undefined;

const SEARCH_BAR_ENABLED = import.meta.env.VITE_SEARCH_BAR_ENABLED || undefined;

const HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS =
    import.meta.env.VITE_HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS || 'false';

const VITE_ROUTER_BASENAME = import.meta.env.VITE_ROUTER_BASENAME || '/';

const VITE_SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';
const VITE_SENTRY_ENV = import.meta.env.VITE_SENTRY_ENV || 'dev';

export default {
    routerBasename: VITE_ROUTER_BASENAME,
    sentry: {
        dsn: VITE_SENTRY_DSN,
        env: VITE_SENTRY_ENV,
    },
    content: {
        showSearchBar: SEARCH_BAR_ENABLED !== 'false',
        showDocumentModelSelectionSetting:
            HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS !== 'true',
    },
    drives: {
        sections: {
            local: {
                enabled: LOCAL_DRIVES_ENABLED !== 'false',
                allowAdd: DISABLE_ADD_LOCAL_DRIVES !== 'true',
                allowDelete: DISABLE_DELETE_LOCAL_DRIVES !== 'true',
            },
            cloud: {
                enabled: CLOUD_DRIVES_ENABLED !== 'false',
                allowAdd: DISABLE_ADD_CLOUD_DRIVES !== 'true',
                allowDelete: DISABLE_DELETE_CLOUD_DRIVES !== 'true',
            },
            public: {
                enabled: PUBLIC_DRIVES_ENABLED !== 'false',
                allowAdd: DISABLE_ADD_PUBLIC_DRIVES !== 'true',
                allowDelete: DISABLE_DELETE_PUBLIC_DRIVES !== 'true',
            },
        },
    },
};
