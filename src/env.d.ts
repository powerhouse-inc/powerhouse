/// <reference types="vite/client" />

interface ImportMetaEnv {
    VITE_ENABLED_EDITORS: string;
    VITE_DISABLED_EDITORS: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
