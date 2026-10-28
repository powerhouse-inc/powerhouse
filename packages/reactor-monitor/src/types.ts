import type {
  ChannelScheme,
  IEventBus,
  IDocumentModelRegistry,
  IInspector,
  IInspectorAdmin,
  InProcessReactorClientModule,
  InProcessReactorModule,
  InspectorAccess,
  IReactorClient,
  IReactorDbQuery,
  ISyncAdmin,
  ISyncInspector,
  ISyncManager,
  JwtHandler,
  ReactorFeatureFlags,
  ReactorInfo,
  WireDeadLetterPage,
  WireQueueState,
} from "@powerhousedao/reactor";
import type {
  IInspectorProxy,
  IWorkerAdminClient,
  WorkerInspectorInfo,
  WorkerPackageSource,
} from "@powerhousedao/reactor-browser/rpc";
import type {
  DocumentModelModule,
  ISigner,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { PGlite } from "@electric-sql/pglite";
import type {
  ManagedAttachments,
  ReactorAttachmentsConfig,
} from "./attachments/types.js";
import type { RemoteInspectionHeaders } from "./remote/transport.js";
import type { AdoptLocalSyncPeerLink } from "./sync/types.js";

/** How a monitored reactor is hosted. */
export type ReactorKind = "worker" | "in-process" | "remote";

/**
 * Where a provisioned reactor keeps its operation store.
 *
 * `idb` is the browser default and the only one that survives a reload;
 * `memory` is a fresh ephemeral PGlite (tests, throwaway reactors); `path`
 * names a data directory for a Node host.
 */
export type ReactorStorageConfig =
  | { kind: "idb" }
  | { kind: "memory" }
  | { kind: "path"; dataDir: string };

/**
 * Packages the reactor imports at boot, by registry spec or by URL. This is
 * the only way to get document models into a `worker` reactor: modules carry
 * reducer functions, which do not survive `postMessage`.
 */
export type ReactorPackageConfig = {
  /** Registry the specs resolve against. */
  cdnUrl?: string;
  /** Registry package specs (`name@version`). */
  specs?: string[];
  /** URL-addressed worker-importable models entries. */
  sources?: WorkerPackageSource[];
};

/**
 * Sync configuration. The default builds the reactor's sync module on
 * {@link ChannelScheme.CONNECT} so remotes can be added later; `channelScheme:
 * null` builds no sync module at all.
 */
export type ReactorSyncConfig = {
  channelScheme?: ChannelScheme | null;
  /**
   * Builds the sync module on a lone `LocalChannelFactory`: a local-ONLY
   * reactor, deliberately Switchboard- and GraphQL-free.
   * When set, `channelScheme` is ignored.
   *
   * Not needed to adopt brokered `LocalChannel` peers any more. A gql-scheme
   * reactor composes a local factory onto its scheme, so it declares
   * `syncChannels: ["gql", "local"]` and accepts both kinds of remote. Use
   * this only for a reactor that must have no gql factory at all.
   */
  local?: boolean;
  /**
   * Mints bearer tokens for remote channels. In-process only — a handler is a
   * function and cannot cross into a worker; a worker reactor runs
   * unauthenticated until the monitor grows an identity channel.
   */
  jwtHandler?: JwtHandler;
};

/**
 * Where an already-running reactor lives and how to reach its inspection
 * surface. `remote` kind only.
 */
export type ReactorRemoteConfig = {
  /**
   * A drive address on the switchboard, `<switchboard>/d/<slug>`, e.g.
   * `http://localhost:4001/d/powerhouse`. Its GraphQL endpoint is
   * `<switchboard>/graphql`, and the inspection subgraph is mounted beneath
   * that at `/inspection` unless {@link inspectionUrl} overrides it.
   */
  url: string;
  /**
   * The inspection subgraph's endpoint, when it is not `${url}/inspection` --
   * a host behind a path-rewriting proxy, or the stitched supergraph at
   * `${url}` itself, which serves the same fields.
   */
  inspectionUrl?: string;
  /**
   * Headers to send with every inspection request, resolved per request. The
   * seam an authenticated monitor threads a bearer through; absent, the
   * reactor is inspected unauthenticated, which is what a dev Switchboard
   * under the OPEN policy serves.
   */
  headers?: RemoteInspectionHeaders;
  /** Defaults to the global `fetch`. A test seam, and a host with its own agent. */
  fetch?: typeof fetch;
  /** Bound on one inspection request; defaults to 30s. */
  timeoutMs?: number;
};

/** What to provision. `name` must be unique across a monitor session. */
export interface ReactorDescriptor {
  kind: ReactorKind;
  /**
   * Unique instance name. Becomes the storage namespace and (for `worker`)
   * the SharedWorker name, so N descriptors with N names coexist in one
   * origin without sharing a store or a worker.
   */
  name: string;
  /**
   * Document models the reactor registers directly. In-process only (see
   * {@link ReactorPackageConfig}). Defaults to
   * `@powerhousedao/reactor-browser`'s `baseDocumentModels`, so drives work.
   */
  documentModelModules?: DocumentModelModule[];
  /** Upgrade manifests registered beside `documentModelModules`. In-process only. */
  upgradeManifests?: UpgradeManifest<readonly number[]>[];
  /** Packages imported at boot; the worker path's only model source. */
  packages?: ReactorPackageConfig;
  /** Enforcement flags. Absent means all off. */
  featureFlags?: Partial<ReactorFeatureFlags>;
  sync?: ReactorSyncConfig;
  /** Defaults to `DEFAULT_REACTOR_STORAGE` (`store.ts`): `{ kind: "idb" }`. */
  storage?: ReactorStorageConfig;
  /**
   * Attachment byte movement: a local byte store plus a fetch-on-reference
   * replicator. Absent, the reactor holds no attachment
   * bytes and {@link ManagedReactorBase.attachments} is absent too.
   *
   * In-process only for now. A worker reactor would need the store config to
   * ride the construct and the status/peer ops to cross the RPC boundary.
   */
  attachments?: ReactorAttachmentsConfig;
  /**
   * Signs submitted actions and synthesized operations. In-process only;
   * defaults to a fresh `LocalSigner` (an ephemeral P-256 key, no Renown).
   */
  signer?: ISigner;
  /**
   * `worker` only: constructs the SharedWorker.
   *
   * The preferred seam for a bundled app: a bundler only emits a worker chunk
   * when it can see `new SharedWorker(new URL("./literal", import.meta.url))`
   * at the construction site, which cannot be inside this library. Supply one
   * line in the app and everything else is handled here. See
   * {@link reactorMonitorWorkerUrl}.
   */
  createWorker?: (name: string) => SharedWorker;
  /**
   * `worker` only: where the SharedWorker script lives, when
   * {@link ReactorDescriptor.createWorker} is not given. Absent, the
   * package's own entry is resolved relative to the library module, which
   * works where the bundler reads this package from source.
   */
  workerUrl?: string | URL;
  /**
   * `remote` only, and required for it: the already-running reactor to attach
   * to. Nothing is built in this process; the handle's inspection surfaces
   * speak to that reactor over HTTP.
   */
  remote?: ReactorRemoteConfig;
}

/** The in-process reactor graph plus the PGlite it was opened over. */
export interface MonitorInProcessReactorModule extends InProcessReactorModule {
  pg: PGlite;
}

/**
 * `BrowserReactorClientModule`-shaped: the full in-process client module,
 * discriminated by `kind` and carrying the PGlite handle.
 */
export interface MonitorInProcessClientModule extends InProcessReactorClientModule {
  kind: "in-process";
  reactorModule: MonitorInProcessReactorModule | undefined;
}

/** Sync manager, reads and repair levers, local or proxied. */
export type FullSyncManager = ISyncManager & ISyncInspector & ISyncAdmin;

/** The tab-side view of a worker reactor, from the Connect-free `/rpc` entry. */
export interface MonitorWorkerClientModule {
  kind: "worker";
  client: IReactorClient;
  adminClient: IWorkerAdminClient;
  inspector: IInspectorProxy;
  reactorModule: {
    documentModelRegistry: IDocumentModelRegistry;
    syncModule: { syncManager: FullSyncManager };
    eventBus: IEventBus;
  };
  /** Loads (or replaces) URL-addressed packages in the worker's registry. */
  registerPackages: (sources: WorkerPackageSource[]) => Promise<void>;
}

/** Where a reactor runs and how the monitor reaches its inspection surface. */
export type MonitorReach = {
  readonly hosting: ReactorKind;
  readonly inspection: "direct" | "rpc" | "none";
};

/** `ReactorInfo`; a remote serves `access: null` to a caller that is not an admin. */
export type MonitorReactorInfo = Omit<ReactorInfo, "access"> & {
  readonly access: InspectorAccess | null;
};

/** `IInspector` with the reads a remote can only serve as wire records. */
export type MonitorInspector = Omit<IInspector, "info" | "getQueueState"> & {
  info(): Promise<MonitorReactorInfo>;
  getQueueState(): Promise<WireQueueState>;
};

/** `ISyncInspector` with dead letters as wire records. */
export type MonitorSyncInspector = Omit<ISyncInspector, "listDeadLetters"> & {
  listDeadLetters(
    remoteName: string,
    cursor?: string,
    limit?: number,
  ): Promise<WireDeadLetterPage>;
};

export type MonitorSyncManager = ISyncManager & MonitorSyncInspector;

/** Shared surface of every provisioned reactor. */
export interface ManagedReactorBase {
  readonly name: string;
  readonly kind: ReactorKind;
  readonly reach: MonitorReach;
  /** Read once at provision; a remote re-reads it through `refreshInfo`. */
  readonly info: MonitorReactorInfo;
  /** The reactor's client: direct in-process, an RPC proxy in a worker. */
  readonly client: IReactorClient;
  readonly inspector: MonitorInspector;
  /** Present when `info.access.admin`. */
  readonly admin?: IInspectorAdmin;
  /**
   * Processor retry and rerun: `admin`'s for a reactor the monitor built; a
   * remote's while its host serves `inspection-admin` to this caller.
   */
  readonly processorLevers?: ProcessorLevers;
  /** Raw SQL against the reactor's own store; present when `info.access.sql`. */
  readonly dbQuery?: IReactorDbQuery;
  readonly syncManager: MonitorSyncManager | undefined;
  /** Channel reset and dead-letter levers; absent for a remote reactor. */
  readonly syncAdmin?: ISyncAdmin;
  /**
   * Direct in-process, a forwarding proxy in a worker. A worker bus relays only
   * `FORWARDED_BUS_EVENT_TYPES` and throws on a `subscribe` for anything else.
   */
  readonly events: IEventBus;
  /**
   * Adopts one end of a monitor-brokered local-sync link. Present, with
   * {@link removeLocalSyncPeer}, whenever `info.syncChannels` includes `"local"`.
   * Prefer {@link ReactorMonitorRegistry.linkLocalSync}, which brokers both ends.
   */
  adoptLocalSyncPeer?: (link: AdoptLocalSyncPeerLink) => Promise<void>;
  /** Removes a local remote and releases its port, in the realm that owns both. */
  removeLocalSyncPeer?: (
    remoteName: string,
    peerId: string,
    channelName: string,
  ) => Promise<void>;
  /** Attachment store and replicator; present when this process built them. */
  readonly attachments?: ManagedAttachments;
  /** Worker lifecycle info; worker-hosted reactors only. */
  adminInfo?: () => Promise<WorkerInspectorInfo>;
  /** Restarts the host; worker-hosted reactors only. */
  restart?: () => Promise<void>;
  /** Shuts the reactor down and releases its store / worker port. */
  kill: () => Promise<void>;
  /** For a worker, whether this client released its connection. */
  isShutdown: () => boolean;
}

export interface ManagedInProcessReactor extends ManagedReactorBase {
  readonly kind: "in-process";
  readonly info: ReactorInfo;
  readonly admin: IInspectorAdmin;
  readonly dbQuery: IReactorDbQuery;
  readonly module: MonitorInProcessClientModule;
}

export interface ManagedWorkerReactor extends ManagedReactorBase {
  readonly kind: "worker";
  readonly info: ReactorInfo;
  readonly module: MonitorWorkerClientModule;
  /** Always present: the proxy exists whether or not the worker built sync. */
  readonly syncManager: MonitorSyncManager;
  /** Present when `info.access.admin`. */
  readonly syncAdmin?: ISyncAdmin;
  adminInfo: () => Promise<WorkerInspectorInfo>;
  restart: () => Promise<void>;
  /**
   * The worker builds once: true when this handle asked for a different
   * storage or local channel than the reactor the worker built. `info`
   * describes what was built.
   */
  readonly descriptorMismatch: boolean;
}

/** The processor levers a remote can serve beside its read-only inspection. */
export type ProcessorLevers = Pick<
  IInspectorAdmin,
  "retryProcessor" | "rerunProcessor" | "setCatchUpPriority"
>;

/** A running reactor reached over its host's inspection subgraph; read-only. */
export interface ManagedRemoteReactor extends ManagedReactorBase {
  readonly kind: "remote";
  readonly syncManager: MonitorSyncManager;
  readonly admin?: undefined;
  readonly dbQuery?: undefined;
  readonly syncAdmin?: undefined;
  /** The inspection endpoint this handle talks to. */
  readonly endpoint: string;
  /** The switchboard's GraphQL endpoint, from the descriptor's drive
   * address; sibling subgraphs derive from it. */
  readonly url: string;
  /** The inspection auth, for sibling subgraph reads of the same reactor. */
  readonly headers?: RemoteInspectionHeaders;
  readonly fetch?: typeof fetch;
  /** Re-reads `info`, and whether the levers are served, and updates the handle's. */
  refreshInfo(): Promise<MonitorReactorInfo>;
}

/** A reactor the monitor has provisioned and can inspect. */
export type ManagedReactor =
  | ManagedInProcessReactor
  | ManagedWorkerReactor
  | ManagedRemoteReactor;
