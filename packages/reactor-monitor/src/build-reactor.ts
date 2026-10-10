import type { PGlite } from "@electric-sql/pglite";
import {
  ChannelScheme,
  createReactorInspector,
  HardenedPGliteDialect,
  IN_MEMORY_PGLITE_STORAGE_FACTS,
  LOCAL_CHANNEL_TYPE,
  LocalChannelFactory,
  LocalChannelPortRegistry,
  PGLITE_IDB_STORAGE_FACTS,
  PGLITE_PATH_STORAGE_FACTS,
  queryThroughDialect,
  ReactorBuilder,
  ReactorClientBuilder,
  ReactorInspector,
  SyncBuilder,
  type Database,
  type IDocumentModelLoader,
  type IInspectorStorageHealthProvider,
  type InspectorAccess,
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
import { childLogger } from "document-model";
import { Kysely } from "kysely";
import {
  buildAttachmentModule,
  type AttachmentModule,
} from "./attachments/index.js";
import { createLocalSigner } from "./signer.js";
import { DEFAULT_REACTOR_STORAGE, openReactorStore } from "./store.js";
import type { ReactorAttachmentsConfig } from "./attachments/types.js";
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
  /** A lone local factory, no gql; a gql scheme composes a local factory anyway. */
  localSync?: boolean;
  jwtHandler?: JwtHandler;
  /** Defaults to a fresh {@link LocalSigner}. */
  signer?: ISigner;
  /** Resolves models on demand; the worker path passes its package loader. */
  documentModelLoader?: IDocumentModelLoader;
  /** Attachment byte movement; absent, no attachment store and no replicator. */
  attachments?: ReactorAttachmentsConfig;
  /** The store's session is poisoned and never reused; the host restarts. */
  onUnrecoverable?: (cause: Error) => void;
  /** Bound on stopping sync and the reactor at shutdown; the store closes after. */
  stopTimeoutMs?: number;
};

/** A built reactor plus the handles a host needs to inspect and tear it down. */
export type BuiltReactor = {
  module: InProcessReactorClientModule;
  pg: PGlite;
  /** In-process inspector over this module's live components. */
  inspector: ReactorInspector;
  /** Raw SQL against this reactor's own store. */
  dbQuery: IReactorDbQuery;
  /** Brokered local-sync ports; absent only without a sync module. */
  localChannelPorts?: LocalChannelPortRegistry;
  /** Present when the build asked for attachments. */
  attachments?: AttachmentModule;
  /** Stops sync, kills the reactor, closes the store. */
  shutdown: () => Promise<void>;
  /** True once {@link shutdown} has been entered. */
  isShutdown: () => boolean;
};

const MONITOR_ACCESS: InspectorAccess = { admin: true, sql: true };

/** As Connect's worker: a poisoned statement can hold up the reactor's stop. */
const REACTOR_STOP_MS = 5_000;

async function settleWithin(
  work: Promise<unknown>,
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.error(
        `[reactor-monitor] reactor stop did not finish within ${timeoutMs}ms`,
      );
      resolve();
    }, timeoutMs);
  });
  await Promise.race([work, expired]);
  clearTimeout(timer);
}

function reportUnrecoverable(cause: Error): void {
  console.error("[reactor-monitor] reactor store poisoned:", cause);
}

/** A poisoned memory or path session reports unhealthy, as group commit does. */
function dialectHealth(): IInspectorStorageHealthProvider & {
  markPoisoned(): void;
} {
  let healthy = true;
  return {
    markPoisoned: () => {
      healthy = false;
    },
    getStorageHealth: () => ({
      tracked: true,
      healthy,
      everRecreated: false,
      recreateCount: 0,
    }),
  };
}

/** One reactor in this realm; the in-process and worker kinds both build here. */
export async function buildMonitorReactor(
  options: BuildReactorOptions,
): Promise<BuiltReactor> {
  const storage = options.storage ?? DEFAULT_REACTOR_STORAGE;
  const onUnrecoverable = options.onUnrecoverable ?? reportUnrecoverable;
  const pg = await openReactorStore(options.namespace, storage);

  const models = options.documentModelModules ?? baseDocumentModels;
  const localOnly = isLocalOnlySync(options.localSync);
  const scheme = localOnly
    ? null
    : options.channelScheme === undefined
      ? ChannelScheme.CONNECT
      : options.channelScheme;
  const localChannelPorts =
    localOnly || scheme !== null
      ? new LocalChannelPortRegistry({
          logger: childLogger(["reactor-monitor", "local-sync"]),
        })
      : undefined;

  const reactorBuilder = new ReactorBuilder()
    .withDocumentModelSources(models)
    .withExecutorConfig({ featureFlags: options.featureFlags ?? {} });

  let storageHealth: IInspectorStorageHealthProvider | undefined;
  let db: Kysely<Database> | undefined;
  if (storage.kind === "idb") {
    reactorBuilder.withGroupCommitPGlite({
      pg,
      onUnrecoverable,
      onDiagnostic: (message, error) =>
        console.error(`[reactor-monitor] pglite: ${message}`, error),
    });
    reactorBuilder.withStorageFacts(PGLITE_IDB_STORAGE_FACTS);
  } else {
    const health = dialectHealth();
    storageHealth = health;
    db = new Kysely<Database>({
      dialect: new HardenedPGliteDialect(pg, {
        onPoisoned: (cause) => {
          health.markPoisoned();
          onUnrecoverable(cause);
        },
      }),
    });
    reactorBuilder
      .withKysely(db)
      .withStorageFacts(
        storage.kind === "memory"
          ? IN_MEMORY_PGLITE_STORAGE_FACTS
          : PGLITE_PATH_STORAGE_FACTS,
      );
  }

  if (options.upgradeManifests && options.upgradeManifests.length > 0) {
    reactorBuilder.withUpgradeManifests(options.upgradeManifests);
  }
  const localFactory = localChannelPorts
    ? new LocalChannelFactory(
        childLogger(["reactor-monitor", "local-channel"]),
        localChannelPorts.provider,
      )
    : undefined;
  if (localOnly && localFactory) {
    reactorBuilder.withSync(new SyncBuilder().withChannelFactory(localFactory));
  } else if (scheme !== null && localFactory) {
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
    await pg.close().catch(() => undefined);
    throw error;
  }

  const rm = module.reactorModule;
  const inspector = rm
    ? createReactorInspector(rm, { storageHealth, access: MONITOR_ACCESS })
    : new ReactorInspector({});

  const database = rm?.database ?? db;
  const dbQuery: IReactorDbQuery = {
    queryDb: (sql, params) => {
      if (!database) {
        return Promise.reject(new Error("This reactor has no database"));
      }
      return queryThroughDialect(database, sql, params);
    },
  };

  let attachments: AttachmentModule | undefined;
  if (options.attachments) {
    if (!rm) {
      throw new Error(
        "attachments were requested but this reactor build has no reactor module to attach a byte store to; attachment byte movement is in-process only",
      );
    }
    attachments = buildAttachmentModule({
      config: options.attachments,
      namespace: options.namespace,
      eventBus: module.eventBus,
      documentModelRegistry: rm.documentModelRegistry,
      ...(rm.syncModule ? { syncManager: rm.syncModule.syncManager } : {}),
      ...(options.jwtHandler ? { jwtHandler: options.jwtHandler } : {}),
    });
    attachments.replicator.start();
  }

  let shuttingDown: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    shuttingDown ??= (async () => {
      if (attachments) {
        try {
          await attachments.shutdown();
        } catch (error) {
          console.error("[reactor-monitor] attachment shutdown failed:", error);
        }
      }
      const stopping = (async () => {
        // The reactor's kill() does not stop sync.
        const sync = rm?.syncModule?.syncManager;
        if (sync) {
          try {
            await sync.shutdown().completed;
          } catch (error) {
            console.error("[reactor-monitor] sync shutdown failed:", error);
          }
        }
        localChannelPorts?.close();
        try {
          await module.reactor.kill().completed;
        } catch (error) {
          console.error("[reactor-monitor] reactor kill failed:", error);
        }
      })();
      await settleWithin(stopping, options.stopTimeoutMs ?? REACTOR_STOP_MS);
      try {
        await database?.destroy();
      } catch (error) {
        console.error("[reactor-monitor] database destroy failed:", error);
      }
      try {
        // Group commit flushes, then closes pg itself.
        await (rm?.groupCommitStorage
          ? rm.groupCommitStorage.close()
          : pg.close());
      } catch (error) {
        console.error("[reactor-monitor] store close failed:", error);
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
    ...(attachments ? { attachments } : {}),
    shutdown,
    isShutdown: () => shuttingDown !== undefined,
  };
}
