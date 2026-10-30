/**
 * A clean, Renown-free, Connect-free way to provision and manage browser
 * reactors: `provision(descriptor)` returns a `ManagedReactor` whose client,
 * inspector, raw-SQL capability and sync manager are reached the same way
 * whether the reactor lives in a SharedWorker or on the calling thread. The
 * RPC machinery is consumed from `@powerhousedao/reactor-browser/rpc`; the
 * reactor graph and the typed inspector come from `@powerhousedao/reactor`.
 *
 * React consumers import the scoped context from
 * `@powerhousedao/reactor-monitor/react`.
 */

export { ReactorMonitorVersion } from "./version.js";

export type {
  FullSyncManager,
  ManagedInProcessReactor,
  ManagedReactor,
  ManagedReactorBase,
  ManagedRemoteReactor,
  ManagedWorkerReactor,
  MonitorInProcessClientModule,
  MonitorInProcessReactorModule,
  MonitorInspector,
  MonitorReach,
  MonitorReactorInfo,
  MonitorSyncInspector,
  MonitorSyncManager,
  MonitorWorkerClientModule,
  KeyframeLevers,
  ProcessorLevers,
  ReactorDescriptor,
  ReactorKind,
  ReactorPackageConfig,
  ReactorRemoteConfig,
  ReactorStorageConfig,
  ReactorSyncConfig,
} from "./types.js";

export {
  toMonitorInspector,
  toMonitorSyncInspector,
  toMonitorSyncManager,
} from "./monitor-inspector.js";
export { isLocalOnlySync } from "./sync-mode.js";

export {
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
  POLLING_CHANNEL_TYPE,
} from "@powerhousedao/reactor";

export { provision, type ProvisionOptions } from "./provision.js";
export {
  provisionInProcess,
  type ProvisionInProcessOptions,
} from "./in-process.js";

export * from "./remote/index.js";
export {
  connectManagedWorkerReactor,
  provisionWorkerReactor,
  type ProvisionWorkerOptions,
} from "./worker/client.js";
export { reactorMonitorWorkerUrl } from "./worker-url.js";

export {
  ReactorMonitorRegistry,
  type ManagedReactorEntry,
  type ReactorMonitorRegistryListener,
} from "./registry.js";

export {
  linkLocalSync,
  type LinkLocalSyncOptions,
  type LocalSyncHandle,
} from "./sync/link.js";
export type { AdoptLocalSyncPeerLink } from "./sync/types.js";

export {
  buildMonitorReactor,
  type BuildReactorOptions,
  type BuiltReactor,
} from "./build-reactor.js";

export * from "./attachments/index.js";
export type { IAttachmentStore } from "@powerhousedao/reactor-attachments";
export type {
  AttachmentReplicationEntry,
  AttachmentReplicationState,
  AttachmentReplicatorStatus,
  AttachmentRetryPolicy,
  IOperationAttachmentRefs,
} from "@powerhousedao/reactor-attachments/replication";

export {
  runLocalSyncLoad,
  type LoadHarnessDurations,
  type LoadHarnessMemorySamples,
  type LoadHarnessOperationCounts,
  type LoadHarnessOptions,
  type LoadHarnessReactors,
  type LoadHarnessReport,
  type LoadHarnessThroughput,
} from "./harness/load.js";
export {
  DEFAULT_REACTOR_STORAGE,
  openReactorStore,
  storageLocation,
} from "./store.js";
export {
  MONITOR_STORAGE_PREFIX,
  MONITOR_WORKER_PREFIX,
  normalizeReactorName,
  reactorStorageNamespace,
  reactorWorkerName,
} from "./naming.js";
export {
  ANONYMOUS_MONITOR_USER,
  createLocalSigner,
  LocalSigner,
  MONITOR_APP_NAME,
  type LocalSignerOptions,
} from "./signer.js";

// Worker-side building blocks, exported so a host other than this package's
// own SharedWorker entry (a test, a future Node host) can assemble one.
export {
  buildWorkerReactor,
  type BuildWorkerReactorOptions,
  type BuiltWorkerReactor,
  type WorkerPackageImporters,
} from "./worker/build-worker-reactor.js";
export {
  createMonitorWorkerHost,
  type MonitorWorkerHost,
  type MonitorWorkerHostOptions,
} from "./worker/host.js";
export {
  parseWorkerConstruct,
  toWorkerConstruct,
  type MonitorWorkerConstruct,
} from "./worker/construct.js";
