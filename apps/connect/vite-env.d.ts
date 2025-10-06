/// <reference types="vite/client" />

import type { ConnectRuntimeEnv } from "@powerhousedao/builder-tools";

interface ViteTypeOptions {
  // By adding this line, you can make the type of ImportMetaEnv strict
  // to disallow unknown keys.
  strictImportMetaEnv: unknown;
}

declare global {
  interface ImportMetaEnv extends ConnectRuntimeEnv {
    readonly VITE_APP_TITLE: string;
    // more env variables...
  }
}
interface ImportMeta {
  readonly env: ConnectRuntimeEnv;
}
