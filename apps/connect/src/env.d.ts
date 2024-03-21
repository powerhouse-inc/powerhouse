/// <reference types="vite/client" />

interface ImportMetaEnv {
    VITE_ENABLED_EDITORS: string;
    VITE_DISABLED_EDITORS: string;
    VITE_DEFAULT_DRIVE_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
