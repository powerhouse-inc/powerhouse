/// <reference types="vite/client" />

interface ImportMetaEnv {
    VITE_ENABLED_EDITORS: string;
    VITE_DISABLED_EDITORS: string;
    VITE_DEFAULT_DRIVE_URL: string;
    VITE_DISABLE_ADD_PUBLIC_DRIVES: string;
    VITE_DISABLE_ADD_CLOUD_DRIVES: string;
    VITE_DISABLE_ADD_LOCAL_DRIVES: string;
    VITE_DISABLE_DELETE_PUBLIC_DRIVES: string;
    VITE_DISABLE_DELETE_CLOUD_DRIVES: string;
    VITE_DISABLE_DELETE_LOCAL_DRIVES: string;
    VITE_PUBLIC_DRIVES_ENABLED: string;
    VITE_CLOUD_DRIVES_ENABLED: string;
    VITE_LOCAL_DRIVES_ENABLED: string;
    VITE_SEARCH_BAR_ENABLED: string;
    VITE_ROUTER_BASENAME: string;
    VITE_SENTRY_DSN: string;
    VITE_SENTRY_ENV: string;
    VITE_CREATE_DOCUMENT_ALLOW_LIST: string | undefined;
    VITE_HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
