import type { PGlite } from "@electric-sql/pglite";
import {
  ChannelScheme,
  channelFactoryTypes,
  createReactorInspector,
  HardenedPGliteDialect,
  LOCAL_CHANNEL_TYPE,
  LocalChannelFactory,
  queryThroughDialect,
  ReactorBuilder,
  ReactorClientBuilder,
  ReactorEventTypes,
  ReactorInspector,
  SelfHealingPGliteClient,
  StorageHealthTracker,
  SyncBuilder,
  type Database,
  type IDocumentModelLoader,
  type InProcessReactorClientModule,
  type IReactorDbQuery,
  type JwtHandler,
  type ReactorFeatureFlags,
  type RecreatablePGliteInstance,
} from "@powerhousedao/reactor";
import { baseDocumentModels } from "@powerhousedao/reactor-browser/base-document-models";
import type {
  DocumentModelModule,
  ISigner,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { childLogger } from "document-model";
import { Kysely } from "kysely";
import { createLocalSigner } from "./signer.js";
import { DEFAULT_REACTOR_STORAGE, openReactorStore } from "./store.js";
import { LocalChannelPortRegistry } from "./sync/local-channel-registry.js";
import { isLocalOnlySync } from "./sync-mode.js";
import type { ReactorStorageConfig } from "./types.js";

/** Everything the realm-local reactor graph is built from. */
export type BuildReactorOptions = {
  /** Store namespace; `reactorStorageNamespace(descriptor.name)`. */
  namespace: string;
  storage?: ReactorStorageConfig;
  /**
   * Models registered directly. Defaults to `baseDocumentModels` so drives
   * work out of the box; pass `[]` for a reactor with no models at all.
   */
  documentModelModules?: DocumentModelModule[];
  upgradeManifests?: UpgradeManifest<readonly number[]>[];
  featureFlags?: Partial<ReactorFeatureFlags>;
  /** `null` builds no sync module; omitted means {@link ChannelScheme.CONNECT}. */
  channelScheme?: ChannelScheme | null;
  /**
   * Builds the sync module on a lone {@link LocalChannelFactory} instead of a
   * gql scheme: a local-ONLY reactor, deliberately Switchboard- and
   * GraphQL-free (multi-reactor W1.2). When set, `channelScheme` is ignored.
   *
   * Brokered local peers no longer REQUIRE this. A gql-scheme reactor composes
   * a `LocalChannelFactory` onto its scheme (W3.0), so it adopts brokered
   * peers too and {@link BuiltReactor.localChannelPorts} is present for it as
   * well. Keep this only for a reactor that must have no gql factory at all.
   */
  localSync?: boolean;
  jwtHandler?: JwtHandler;
  /** Defaults to a fresh {@link LocalSigner}. */
  signer?: ISigner;
  /** Resolves models on demand; the worker path passes its package loader. */
  documentModelLoader?: IDocumentModelLoader;
  /** An already-open store; the caller then owns closing it. */
  pg?: PGlite;
};

/** A built reactor plus the handles a host needs to inspect and tear it down. */
export type BuiltReactor = {
  module: InProcessReactorClientModule;
  pg: PGlite;
  /** In-process `IInspector` over this module's live components (W0.3). */
  inspector: ReactorInspector;
  /** Raw SQL against this reactor's own store. */
  dbQuery: IReactorDbQuery;
  /**
   * The brokered-local-sync port registry. The adopt-sync-peer op registers a
   * transferred port here, and this reactor's `LocalChannelFactory` resolves
   * it.
   *
   * Present for every reactor that built a sync module at all -- the
   * {@link BuildReactorOptions.localSync} local-only mode AND a gql scheme,
   * which composes a local factory onto itself (W3.0). Absent only for a
   * `channelScheme: null` island, which has no sync module to adopt into.
   */
  localChannelPorts?: LocalChannelPortRegistry;
  /**
   * Whether a poisoned PGlite session is recovered in place: a durable store
   * this process opened (not a caller-supplied `pg`, which the caller owns
   * and reopens, and not `memory`, which has nothing to reopen). The fact
   * `capabilities.ts` derives {@link ReactorCapabilities.selfHeal} FROM,
   * rather than re-deriving it from the descriptor alone -- a descriptor
   * cannot express a caller-supplied `pg`, so re-deriving from it would miss
   * exactly that case.
   */
  canSelfHeal: boolean;
  /**
   * The `ChannelConfig.type`s this reactor's sync module actually routes, read
   * off the channel factory it was BUILT with (`channelFactoryTypes`): the
   * composite's registered types for a reactor that composes several
   * transports, the scheme factory's single type when there is no composite,
   * and empty for a `channelScheme: null` island with no sync module at all.
   *
   * The same kind of fact as {@link canSelfHeal}, and present for the same
   * reason: `capabilities.ts` derives
   * {@link ReactorCapabilities.syncChannels} FROM this rather than re-deriving
   * it from the configuration branches that asked for it. A descriptor cannot
   * express which factories were actually composed -- `sync.local` and
   * `channelScheme` describe a REQUEST -- so re-deriving would state what was
   * asked for instead of what routes, and a UI or a router would offer a
   * transport the reactor refuses (or hide one it serves).
   */
  syncChannelTypes: readonly string[];
  /** Stops sync, kills the reactor, destroys the kysely instance, closes the store. */
  shutdown: () => Promise<void>;
  /** True once {@link shutdown} has been entered. */
  isShutdown: () => boolean;
};

/**
 * Builds one reactor in the current realm.
 *
 * This is Connect's two boot paths (`createBrowserReactor` and the worker's
 * `build`) reduced to what the monitor needs: no Renown signer or crypto, no
 * PGlite major detection or migration, no vetra/workflow model bundling, no
 * `/__packages` subscription. Both monitor hosting kinds call it — the
 * in-process one on the main thread, the worker entry inside the worker — so
 * the two kinds cannot drift in how the graph is assembled.
 */
export async function buildMonitorReactor(
  options: BuildReactorOptions,
): Promise<BuiltReactor> {
  const ownsStore = options.pg === undefined;
  const pg =
    options.pg ?? (await openReactorStore(options.namespace, options.storage));

  const models = options.documentModelModules ?? baseDocumentModels;
  // Local-ONLY mode still wires a lone LocalChannelFactory via withSync and
  // leaves the scheme unset. Otherwise the gql scheme (CONNECT by default)
  // wins, and W3.0 composes a LocalChannelFactory onto it rather than making
  // the two exclusive -- so a connect-mode reactor holds Switchboard remotes
  // and brokered peers at once. Only a `channelScheme: null` island gets
  // neither, and so gets no port registry either.
  const localOnly = isLocalOnlySync(options.localSync);
  const scheme = localOnly
    ? null
    : options.channelScheme === undefined
      ? ChannelScheme.CONNECT
      : options.channelScheme;
  const localChannelPorts =
    localOnly || scheme !== null ? new LocalChannelPortRegistry() : undefined;

  // Self-heal only when this reactor owns a durable store it knows how to
  // reopen. A caller-supplied `pg` is owned (and reopened) by the caller, and a
  // memory store has nothing to reopen without data loss, so both keep the
  // dialect's loud refusal. See docs/bugs/2026-10-03-*, W0.7.
  const canSelfHeal =
    ownsStore &&
    (options.storage?.kind ?? DEFAULT_REACTOR_STORAGE.kind) !== "memory";
  // Declared before the client so both poison paths escalate identically: the
  // dialect's hung statement and the client's own hung filesystem sync (W0.8)
  // end in one in-place recreate.
  let poisonSession: (reason: string) => Promise<boolean> = () =>
    Promise.resolve(false);
  const selfHeal = canSelfHeal
    ? new SelfHealingPGliteClient(pg as RecreatablePGliteInstance, {
        openInstance: () =>
          openReactorStore(
            options.namespace,
            options.storage,
          ) as Promise<RecreatablePGliteInstance>,
        onDiagnostic: (message, error) =>
          console.error(`[reactor-monitor] self-heal: ${message}`, error),
        onSyncStuck: (reason) => poisonSession(reason),
      })
    : undefined;

  // Group commit (W0.8): with a durable store that can be reopened, statements
  // stop flushing themselves and durability moves to the two acknowledgment
  // boundaries the flusher owns - a sync cursor write and a non-load job's
  // write-ready announcement. Only available where self-heal is, because the
  // same object is both; a memory store or a caller-owned pg keeps the
  // per-statement flush and the no-op barrier.
  if (selfHeal) {
    selfHeal.setDeferredFlush(true);
  }

  // Storage-health dimension for the inspector, fed by the self-heal path so
  // "connected" can never read green while the session is dead (W0.5 / W0.7).
  const storageHealth = new StorageHealthTracker(
    selfHeal ? () => selfHeal.recreateCount : undefined,
  );
  if (selfHeal) {
    poisonSession = (reason: string) => {
      storageHealth.markPoisoned();
      return selfHeal.recreate(reason);
    };
  }

  // The one Kysely over this reactor's PGlite. Inspector SQL goes through it
  // too, so it enters the dialect's serialising queue instead of landing
  // inside whatever job transaction is open on the shared session. See
  // docs/bugs/2026-10-03-sync-defect-analysis.md, mechanism A-3.
  const db = new Kysely<Database>({
    dialect: new HardenedPGliteDialect(selfHeal ?? pg, {
      onPoisoned: (cause) =>
        poisonSession(cause instanceof Error ? cause.message : String(cause)),
    }),
  });

  const reactorBuilder = new ReactorBuilder()
    .withDocumentModelSources(models)
    .withExecutorConfig({ featureFlags: options.featureFlags ?? {} })
    .withKysely(db);

  if (selfHeal) {
    reactorBuilder.withStorageFlusher(selfHeal);
  }

  if (options.upgradeManifests && options.upgradeManifests.length > 0) {
    reactorBuilder.withUpgradeManifests(options.upgradeManifests);
  }
  // The local factory resolves a brokered MessagePort from the registry under
  // the (peerId, channelName) each remote's ChannelConfig names.
  //
  // A storage heal SEVERS every local link, and does so visibly. The heal path
  // resets each remote's channel, the reset shuts the old channel down (closing
  // the brokered port, which unregisters it here), and the fresh channel's
  // factory lookup then fails loudly with "the link is severed" -- the remote
  // drops out of the registry with that message rather than sitting in
  // `connecting` over a dead port. The monitor's Sync tab shows the link as
  // gone and re-linking is a click; nothing is recoverable automatically,
  // because the other reactor's end of the MessageChannel went with it.
  // Brokered remotes are session-scoped (`RemotePersistence`), so there is no
  // stale record left behind either.
  const localFactory = localChannelPorts
    ? new LocalChannelFactory(
        childLogger(["reactor-monitor", "local-channel"]),
        localChannelPorts.provider,
      )
    : undefined;
  if (localOnly && localFactory) {
    // Local-only: no gql factory at all. The ReactorBuilder applies its own
    // storage flusher to this SyncBuilder via withDefaultStorageFlusher, so
    // the LocalChannel's cursor writes inherit the durability barrier.
    reactorBuilder.withSync(new SyncBuilder().withChannelFactory(localFactory));
  } else if (scheme !== null && localFactory) {
    // W3.0: the builder keeps constructing the scheme's gql factory (only it
    // holds the job queue the poll timer needs) and composes the local one
    // onto it, so this reactor routes `{type:"gql"}` and `{type:"local"}`
    // remotes side by side.
    reactorBuilder
      .withChannelScheme(scheme)
      .withAdditionalChannelFactory(LOCAL_CHANNEL_TYPE, localFactory);
  }
  if (options.jwtHandler) {
    reactorBuilder.withJwtHandler(options.jwtHandler);
  }

  const clientBuilder = new ReactorClientBuilder()
    .withReactorBuilder(reactorBuilder)
    .withSigner(options.signer ?? (await createLocalSigner()));
  if (options.documentModelLoader) {
    clientBuilder.withDocumentModelLoader(options.documentModelLoader);
  }

  let module: InProcessReactorClientModule;
  try {
    module = await clientBuilder.buildModule();
  } catch (error) {
    if (ownsStore) {
      await pg.close().catch(() => undefined);
    }
    throw error;
  }

  // The event bus exists only now, so bind the recovery-event sink here; the
  // event is observable on this reactor's bus like any other lifecycle event.
  selfHeal?.setRecreatedListener((event) => {
    storageHealth.recordRecreated(event);
    void module.eventBus
      .emit(ReactorEventTypes.STORAGE_SESSION_RECREATED, event)
      .catch((error) =>
        console.error(
          "[reactor-monitor] emitting recovery event failed",
          error,
        ),
      );
  });

  const rm = module.reactorModule;
  // The routing fact, taken from the factory the sync module was built with
  // rather than from the branches above that chose it. See
  // BuiltReactor.syncChannelTypes.
  const syncChannelTypes: readonly string[] = Object.freeze(
    rm?.syncModule
      ? [...channelFactoryTypes(rm.syncModule.channelFactory)]
      : [],
  );
  // The shared wiring, so a monitor-hosted reactor and a server-hosted one
  // (reactor-api's inspection subgraph, W3.2) are observed through exactly the
  // same components; the storage-health dimension is this host's to feed.
  const inspector = rm
    ? createReactorInspector(rm, storageHealth)
    : new ReactorInspector({});

  const dbQuery: IReactorDbQuery = {
    queryDb: (sql, params) => queryThroughDialect(db, sql, params),
  };

  let shuttingDown: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    shuttingDown ??= (async () => {
      // The reactor's own kill() does not stop sync: the builder starts the
      // sync manager but registers no closer for it.
      const sync = rm?.syncModule?.syncManager;
      if (sync) {
        try {
          await sync.shutdown().completed;
        } catch (error) {
          console.error("[reactor-monitor] sync shutdown failed:", error);
        }
      }
      try {
        await module.reactor.kill().completed;
      } catch (error) {
        console.error("[reactor-monitor] reactor kill failed:", error);
      }
      try {
        await rm?.database.destroy();
      } catch (error) {
        console.error("[reactor-monitor] database destroy failed:", error);
      }
      if (ownsStore) {
        try {
          // Close the live instance: a self-heal may have swapped `pg` out.
          await (selfHeal ? selfHeal.close() : pg.close());
        } catch (error) {
          console.error("[reactor-monitor] store close failed:", error);
        }
      }
    })();
    return shuttingDown;
  };

  return {
    module,
    pg,
    inspector,
    dbQuery,
    ...(localChannelPorts ? { localChannelPorts } : {}),
    canSelfHeal,
    syncChannelTypes,
    shutdown,
    isShutdown: () => shuttingDown !== undefined,
  };
}
