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
import type { ReactorCapabilities } from "./capabilities.js";
import type {
  RemoteInspectionInfo,
  RemoteInspectorClient,
} from "./remote/client.js";
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
   * reactor, deliberately Switchboard- and GraphQL-free (multi-reactor W1.2).
   * When set, `channelScheme` is ignored.
   *
   * Not needed to adopt brokered `LocalChannel` peers any more. A gql-scheme
   * reactor composes a local factory onto its scheme (W3.0), so it declares
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
 * surface (multi-reactor W3.2). `remote` kind only.
 */
export type ReactorRemoteConfig = {
  /**
   * The reactor's GraphQL endpoint -- the same URL the Sync tab's add-remote
   * form takes, e.g. `http://localhost:4001/graphql`. The inspection subgraph
   * is mounted beneath it at `/inspection`, which is what
   * {@link inspectionEndpoint} derives unless {@link inspectionUrl} overrides
   * it.
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
   * speak to that reactor over HTTP (multi-reactor W3.2).
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
  /**
   * What this reactor can and cannot do, derived from its descriptor at
   * provision time and static for the life of the handle (multi-reactor stage
   * 2). The typed contract a router selects targets on; see
   * {@link ReactorCapabilities}.
   */
  readonly capabilities: ReactorCapabilities;
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
   * and adds the local remote. Present whenever
   * {@link ReactorCapabilities.syncChannels} includes `"local"` -- the
   * local-only `sync.local` mode and a gql scheme alike, since a gql-scheme
   * reactor composes a local factory onto its scheme (W3.0). Prefer
   * {@link ReactorMonitorRegistry.linkLocalSync}, which brokers both ends.
   * Multi-reactor W1.2.
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
   * Present, like {@link adoptLocalSyncPeer}, whenever the reactor declares
   * the `"local"` sync channel. The two always appear and disappear together,
   * so a caller that finds one can rely on the other.
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
  /**
   * True when this handle's connecting descriptor disagreed with the
   * construct the worker actually built -- a later tab's hello whose
   * construct `ReactorHost` silently dropped because the worker builds once
   * (multi-reactor stage 2 review). `capabilities` always describes what was
   * BUILT, never this handle's own request, so a caller that only reads
   * `capabilities` cannot see the disagreement; this flag is the one place it
   * surfaces. Always `false` for the tab whose descriptor won the build.
   */
  readonly descriptorMismatch: boolean;
}

/**
 * An already-running reactor the monitor attached to over HTTP (multi-reactor
 * W3.2): a Switchboard serving reactor-api's inspection subgraph.
 *
 * `inspector`, `dbQuery` and `syncManager` are the SAME typed surfaces the
 * local kinds expose -- that is the whole point, so every inspector view works
 * against a remote reactor unchanged. What is NOT wired is stated rather than
 * faked: `client` and `events` refuse by name (see `remote/unwired.ts`), and
 * the sync manager's reconfiguration half refuses too, because which peers a
 * Switchboard syncs with is that deployment's configuration.
 *
 * `descriptorMismatch` has no analog here: nothing was built from this
 * descriptor, so there is no construct for it to disagree with. The equivalent
 * question -- what is actually on the other end -- is answered by
 * {@link serverInfo}, which `capabilities` is derived from.
 */
export interface ManagedRemoteReactor extends ManagedReactorBase {
  readonly kind: "remote";
  /** Always present: the inspection surface is what a remote reactor is attached for. */
  readonly syncManager: InspectableSyncManager;
  /** The inspection endpoint this handle talks to. */
  readonly endpoint: string;
  /**
   * What the remote reactor reported about itself, including which admin tiers
   * that deployment serves. A view that needs to disable a repair lever or the
   * DB tab reads `adminEnabled` / `sqlEnabled` from here.
   *
   * A LIVE read, not a value frozen at provision time. The two tier flags are
   * the one part of this record an operator changes under a running monitor --
   * restart the host with `PH_INSPECTION_ADMIN=true` -- so the handle reports
   * what the client last learned, and {@link refreshServerInfo} is how a UI
   * asks for a fresh answer. Reading it twice can therefore give two answers;
   * that is the feature.
   *
   * `capabilities` is still derived from the record as it stood at provision
   * time and stays frozen, because the rest of this report describes how the
   * far side was BUILT: a reactor whose channel factories or workflow engine
   * changed is a different reactor, and the contract a router caches must not
   * change under it. Re-provision to pick that up.
   */
  readonly serverInfo: RemoteInspectionInfo;
  /**
   * Re-reads the reported facts from the reactor now and updates
   * {@link serverInfo}.
   *
   * The seam behind the monitor's "re-check server" affordance, and what makes
   * the documented restart-with-the-flag flow work in both directions. The
   * inspection client also calls it on its own refusal paths, so a lever that
   * the far side rejects corrects the gate rather than merely failing.
   */
  refreshServerInfo(): Promise<RemoteInspectionInfo>;
  /** The remote inspection client, for the ops beyond `IInspector`'s own surface. */
  readonly remoteInspector: RemoteInspectorClient;
}

/** A reactor the monitor has provisioned and can inspect. */
export type ManagedReactor =
  | ManagedInProcessReactor
  | ManagedWorkerReactor
  | ManagedRemoteReactor;
