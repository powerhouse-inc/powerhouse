import type { PGlite } from "@electric-sql/pglite";
import {
  ChannelScheme,
  DocumentIntegrityService,
  InMemoryQueue,
  ReactorBuilder,
  ReactorClientBuilder,
  ReactorInspector,
  type Database,
  type IDocumentModelLoader,
  type InProcessReactorClientModule,
  type IReactorDbQuery,
  type JwtHandler,
  type ReactorFeatureFlags,
} from "@powerhousedao/reactor";
import { baseDocumentModels } from "@powerhousedao/reactor-browser/base-document-models";
import type {
  DocumentModelModule,
  ISigner,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
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

  const reactorBuilder = new ReactorBuilder()
    .withDocumentModelSources(models)
    .withExecutorConfig({ featureFlags: options.featureFlags ?? {} })
    .withKysely(new Kysely<Database>({ dialect: new PGliteDialect(pg) }));

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
        }
      : {},
  );

  const dbQuery: IReactorDbQuery = {
    queryDb: async (sql, params) => {
      const result = await pg.query(sql, params);
      return result.rows;
    },
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
          await pg.close();
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
