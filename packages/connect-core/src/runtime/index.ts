// Connect's runtime: reactor client selection, flags, the PH store and the local package.
export {
  getRuntimeConfig,
  loadRuntimeConfig,
  primeRuntimeConfig,
} from "./runtime-config.js";
export { isRuntimeFlagEnabled, resolveRuntimeFlag } from "./runtime-flag.js";
export type { RuntimeFlagInput, RuntimeFlagKeys } from "./runtime-flag.js";
export { isMultiReactorEnabled } from "./multi-reactor-flag.js";
export {
  isReactorWorkerEnabled,
  REACTOR_WORKER_QUERY_KEY,
  REACTOR_WORKER_STORAGE_KEY,
  resolveReactorWorkerEnabled,
} from "./reactor-worker-flag.js";
export type { ReactorWorkerFlagInput } from "./reactor-worker-flag.js";
export { resolveReactorClientMode } from "./reactor-client-mode.js";
export type { ReactorClientMode } from "./reactor-client-mode.js";
export {
  createAppReactorClient,
  getAppDrives,
  planReactorClient,
  refreshAppDrives,
  selectAppReactorClient,
} from "./app-reactor-client.js";
export type {
  AppReactorClientParams,
  CreateAppReactorClientOptions,
  LocalReactorFactory,
  ReactorClientPlan,
} from "./app-reactor-client.js";
export type {
  LoadedDocumentModels,
  LocalReactorModule,
} from "./multi-reactor.js";
export { getConnectPHStore } from "./ph-store.js";
export { loadLocalPackage } from "./local-package.js";
export type {
  LocalPackage,
  LocalPackageSource,
  ModuleNamespace,
} from "./local-package.js";
export { getIsEmbedded, useIsEmbedded } from "./embedded.js";
