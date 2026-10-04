import type {
  ChannelScheme,
  IEventBus,
  IInspector,
  IDocumentModelRegistry,
  InProcessReactorClientModule,
  InProcessReactorModule,
  IReactorClient,
  IReactorDbQuery,
  JwtHandler,
  ReactorFeatureFlags,
} from "@powerhousedao/reactor";
import type {
  IInspectorProxy,
  InspectableSyncManager,
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
   * Builds the sync module on a `LocalChannelFactory` so the reactor can adopt
   * monitor-brokered `LocalChannel` peers (multi-reactor W1.2). Mutually
   * exclusive with a gql `channelScheme`: a reactor wires one channel factory,
   * and W1.2 is Switchboard- and GraphQL-free, so a local-sync reactor is
   * local-only. When set, `channelScheme` is ignored.
   */
  local?: boolean;
  /**
   * Mints bearer tokens for remote channels. In-process only — a handler is a
   * function and cannot cross into a worker; a worker reactor runs
   * unauthenticated until the monitor grows an identity channel.
   */
  jwtHandler?: JwtHandler;
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
  /** Defaults to `{ kind: "idb" }`. */
  storage?: ReactorStorageConfig;
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

/**
 * `WorkerReactorClientModule`-shaped: the tab-side view of a worker reactor.
 * Declared here rather than imported from `@powerhousedao/reactor-browser`'s
 * root barrel so this package depends only on the Connect-free `/rpc` entry.
 */
export interface MonitorWorkerClientModule {
  kind: "worker";
  client: IReactorClient;
  adminClient: IWorkerAdminClient;
  /** `IInspector` plus the proxy's `queryReactorDb` raw-SQL method. */
  inspector: IInspectorProxy;
  reactorModule: {
    documentModelRegistry: IDocumentModelRegistry;
    syncModule: { syncManager: InspectableSyncManager };
    eventBus: IEventBus;
  };
  /** Loads (or replaces) URL-addressed packages in the worker's registry. */
  registerPackages: (sources: WorkerPackageSource[]) => Promise<void>;
}

/** Shared surface of every provisioned reactor. */
export interface ManagedReactorBase {
  readonly name: string;
  readonly kind: ReactorKind;
  /** The reactor's client: direct in-process, an RPC proxy in a worker. */
  readonly client: IReactorClient;
  /** Typed inspection surface (`IInspector`, W0.3). */
  readonly inspector: IInspector;
  /** Raw SQL against the reactor's own store; a capability, not inspection. */
  readonly dbQuery: IReactorDbQuery;
  /** The reactor's sync manager (with its W0.5 inspection surface), or a proxy to it. */
  readonly syncManager: InspectableSyncManager | undefined;
  /**
   * The reactor's event bus: direct in-process, a forwarding proxy in a
   * worker. A worker-hosted bus only relays the types in
   * `FORWARDED_BUS_EVENT_TYPES` (`@powerhousedao/reactor-browser/rpc`) and
   * throws synchronously on a `subscribe` for anything else; an in-process
   * bus accepts any type. A consumer that wants the same code to work
   * against both kinds should subscribe only to the forwarded set.
   */
  readonly events: IEventBus;
  /**
   * Adopts one end of a monitor-brokered local-sync link: registers the port
   * and adds the local remote. Present only when the reactor was provisioned
   * with `sync.local`. Prefer {@link ReactorMonitorRegistry.linkLocalSync},
   * which brokers both ends. Multi-reactor W1.2.
   */
  adoptLocalSyncPeer?: (link: AdoptLocalSyncPeerLink) => Promise<void>;
  /**
   * Removes a local remote added by {@link adoptLocalSyncPeer} (closing its
   * port) and forgets its registration. `peerId`/`channelName` identify the
   * registry entry to drop. Both halves happen in the realm that owns the
   * registry -- directly in process, over the remove-sync-peer op in a worker
   * -- because a registry entry outliving its closed port is exactly how a
   * dead link reports itself healthy.
   *
   * Present, like {@link adoptLocalSyncPeer}, only when the reactor was
   * provisioned with `sync.local`. The two always appear and disappear
   * together, so a caller that finds one can rely on the other.
   */
  removeLocalSyncPeer?: (
    remoteName: string,
    peerId: string,
    channelName: string,
  ) => Promise<void>;
  /** Worker lifecycle info; worker-hosted reactors only. */
  adminInfo?: () => Promise<WorkerInspectorInfo>;
  /** Restarts the host; worker-hosted reactors only. */
  restart?: () => Promise<void>;
  /** Shuts the reactor down and releases its store / worker port. */
  kill: () => Promise<void>;
  /**
   * Whether {@link kill} has been called on this handle. For `in-process`
   * that means the reactor is stopping or stopped; for `worker` it means this
   * client has released its connection — the worker itself goes away when its
   * last client does, which this handle cannot observe.
   */
  isShutdown: () => boolean;
}

export interface ManagedInProcessReactor extends ManagedReactorBase {
  readonly kind: "in-process";
  readonly module: MonitorInProcessClientModule;
}

export interface ManagedWorkerReactor extends ManagedReactorBase {
  readonly kind: "worker";
  readonly module: MonitorWorkerClientModule;
  /** Always present: the proxy exists whether or not the worker built sync. */
  readonly syncManager: InspectableSyncManager;
  adminInfo: () => Promise<WorkerInspectorInfo>;
  restart: () => Promise<void>;
}

/** A reactor the monitor has provisioned and can inspect. */
export type ManagedReactor = ManagedInProcessReactor | ManagedWorkerReactor;
