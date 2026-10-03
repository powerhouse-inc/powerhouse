import type { PGlite } from "@electric-sql/pglite";
import {
  ChannelScheme,
  DocumentIntegrityService,
  HardenedPGliteDialect,
  InMemoryQueue,
  queryThroughDialect,
  ReactorBuilder,
  ReactorClientBuilder,
  ReactorEventTypes,
  ReactorInspector,
  SelfHealingPGliteClient,
  StorageHealthTracker,
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
import { Kysely } from "kysely";
import { createLocalSigner } from "./signer.js";
import { openReactorStore } from "./store.js";
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
  const scheme =
    options.channelScheme === undefined
      ? ChannelScheme.CONNECT
      : options.channelScheme;

  // Self-heal only when this reactor owns a durable store it knows how to
  // reopen. A caller-supplied `pg` is owned (and reopened) by the caller, and a
  // memory store has nothing to reopen without data loss, so both keep the
  // dialect's loud refusal. See docs/bugs/2026-10-03-*, W0.7.
  const canSelfHeal =
    ownsStore && (options.storage?.kind ?? "idb") !== "memory";
  const selfHeal = canSelfHeal
    ? new SelfHealingPGliteClient(pg as RecreatablePGliteInstance, {
        openInstance: () =>
          openReactorStore(
            options.namespace,
            options.storage,
          ) as Promise<RecreatablePGliteInstance>,
        onDiagnostic: (message, error) =>
          console.error(`[reactor-monitor] self-heal: ${message}`, error),
      })
    : undefined;

  // Storage-health dimension for the inspector, fed by the self-heal path so
  // "connected" can never read green while the session is dead (W0.5 / W0.7).
  const storageHealth = new StorageHealthTracker(
    selfHeal ? () => selfHeal.recreateCount : undefined,
  );

  // The one Kysely over this reactor's PGlite. Inspector SQL goes through it
  // too, so it enters the dialect's serialising queue instead of landing
  // inside whatever job transaction is open on the shared session. See
  // docs/bugs/2026-10-03-sync-defect-analysis.md, mechanism A-3.
  const db = new Kysely<Database>({
    dialect: new HardenedPGliteDialect(selfHeal ?? pg, {
      onPoisoned: (cause) => {
        if (!selfHeal) {
          return Promise.resolve(false);
        }
        storageHealth.markPoisoned();
        return selfHeal.recreate(
          cause instanceof Error ? cause.message : String(cause),
        );
      },
    }),
  });

  const reactorBuilder = new ReactorBuilder()
    .withDocumentModelSources(models)
    .withExecutorConfig({ featureFlags: options.featureFlags ?? {} })
    .withKysely(db);

  if (options.upgradeManifests && options.upgradeManifests.length > 0) {
    reactorBuilder.withUpgradeManifests(options.upgradeManifests);
  }
  if (scheme !== null) {
    reactorBuilder.withChannelScheme(scheme);
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
  const inspector = new ReactorInspector(
    rm
      ? {
          // The inspectable queue surface is the in-memory queue's; another
          // implementation degrades to empty queue reads.
          queue: rm.queue instanceof InMemoryQueue ? rm.queue : undefined,
          processorManager: rm.processorManager,
          catchUp: rm.catchUp,
          integrity: new DocumentIntegrityService(
            rm.keyframeStore,
            rm.operationStore,
            rm.writeCache,
            rm.documentView,
            rm.documentModelRegistry,
          ),
          storageHealth,
        }
      : {},
  );

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
    shutdown,
    isShutdown: () => shuttingDown !== undefined,
  };
}
