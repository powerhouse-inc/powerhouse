declare module "*.svg" {
  const ReactComponent: React.FunctionComponent<
    React.SVGAttributes<SVGElement>
  >;
  export { ReactComponent };
}

declare module "ph:external-packages" {
  import type { DocumentModelLib } from "document-model";
  const documentModelLibs: DocumentModelLib[] = [];

  export default documentModelLibs;
}

declare const __APP_VERSION__: string;
declare const __SENTRY_RELEASE__: string;
declare const __REQUIRES_HARD_REFRESH__: boolean;

type ImportMetaEnv = {
  BASE_URL: string;
  MODE: string;
  DEV: boolean;
  PROD: boolean;
  APP_VERSION: string;
  SENTRY_RELEASE: string;
  BASE_PATH: string;
  PH_CONNECT_APP_REQUIRES_HARD_REFRESH: string;
  SENTRY_AUTH_TOKEN: string;
  SENTRY_ORG: string;
  SENTRY_PROJECT: string;
  LOG_LEVEL: string;
  PH_CONNECT_DISABLE_ADD_DRIVE: string;
  PH_CONNECT_WARN_OUTDATED_APP: string;
  PH_CONNECT_STUDIO_MODE: string;
  PH_CONNECT_ROUTER_BASENAME: string;
  PH_CONNECT_DEFAULT_DRIVES_URL: string;
  PH_CONNECT_DRIVES_PRESERVE_STRATEGY: string;
  PH_CONNECT_ENABLED_EDITORS: string;
  PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES: string;
  PH_CONNECT_SEARCH_BAR_ENABLED: string;
  PH_CONNECT_DISABLE_ADD_CLOUD_DRIVES: string;
  PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES: string;
  PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES: string;
  PH_CONNECT_DISABLE_DELETE_CLOUD_DRIVES: string;
  PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES: string;
  PH_CONNECT_PUBLIC_DRIVES_ENABLED: string;
  PH_CONNECT_CLOUD_DRIVES_ENABLED: string;
  PH_CONNECT_LOCAL_DRIVES_ENABLED: string;
  PH_CONNECT_ARBITRUM_ALLOW_LIST: string;
  PH_CONNECT_RWA_ALLOW_LIST: string;
  PH_CONNECT_HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS: string;
  PH_CONNECT_RENOWN_URL: string;
  PH_CONNECT_RENOWN_NETWORK_ID: string;
  PH_CONNECT_RENOWN_CHAIN_ID: string;
  PH_CONNECT_DISABLED_EDITORS: string;
  PH_CONNECT_ANALYTICS_DATABASE_NAME: string;
  PH_CONNECT_ANALYTICS_DATABASE_WORKER_DISABLED: string;
  PH_CONNECT_DIFF_ANALYTICS_ENABLED: string;
  PH_CONNECT_DRIVE_ANALYTICS_ENABLED: string;
  PH_CONNECT_EXTERNAL_PROCESSORS_ENABLED: string;
  PH_CONNECT_SENTRY_DSN: string;
  PH_CONNECT_SENTRY_PROJECT: string;
  PH_CONNECT_SENTRY_ENV: string;
  PH_CONNECT_SENTRY_TRACING_ENABLED: string;
  PH_CONNECT_GA_TRACKING_ID: string;
  FILE_UPLOAD_OPERATIONS_CHUNK_SIZE: string;
  PH_CONNECT_VERSION_CHECK_INTERVAL: string;
  PH_CONNECT_CLI_VERSION: string;
  SSR: boolean;
};

interface ImportMeta {
  url: string;
  readonly hot?: ViteHotContext;
  readonly env: ImportMetaEnv;
  glob: ImportGlobFunction;
}
