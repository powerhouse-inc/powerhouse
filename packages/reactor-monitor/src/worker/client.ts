import {
  DocumentModelRegistry,
  LOCAL_CHANNEL_TYPE,
  READ_ONLY_ACCESS,
  UNKNOWN_STORAGE_FACTS,
  type ReactorFeatureFlags,
  type ReactorInfo,
} from "@powerhousedao/reactor";
import { baseDocumentModels } from "@powerhousedao/reactor-browser/base-document-models";
import {
  connectReactorClient,
  createInspectorProxy,
  createPortTransport,
  createReactorEventBusProxy,
  createWorkerAdminClient,
  MessageRouter,
  RPC_PROTOCOL_VERSION,
  sendAdoptSyncPeer,
  sendRemoveSyncPeer,
  SyncManagerProxy,
  type IRpcTransport,
  type WorkerPackageSource,
} from "@powerhousedao/reactor-browser/rpc";
import {
  toMonitorInspector,
  toMonitorSyncManager,
} from "../monitor-inspector.js";
import { reactorWorkerName } from "../naming.js";
import { DEFAULT_REACTOR_STORAGE } from "../store.js";
import { isLocalOnlySync } from "../sync-mode.js";
import type { AdoptLocalSyncPeerLink } from "../sync/types.js";
import type {
  ManagedWorkerReactor,
  MonitorWorkerClientModule,
  ReactorDescriptor,
} from "../types.js";
import { toWorkerConstruct } from "./construct.js";
import { ReactorMonitorVersion } from "../version.js";
import { reactorMonitorWorkerUrl } from "../worker-url.js";
import { adoptWorkerGen, readWorkerGen } from "./worker-gen.js";

/** Sorted so the same set always produces the same fingerprint. */
function enabledFlagList(flags: Partial<ReactorFeatureFlags>): string {
  return Object.entries(flags)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .sort()
    .join(",");
}

/** `descriptor.workerUrl`, or the package's own entry; see {@link reactorMonitorWorkerUrl}. */
function resolveWorkerUrl(descriptor: ReactorDescriptor): URL {
  if (descriptor.workerUrl) {
    if (descriptor.workerUrl instanceof URL) {
      return descriptor.workerUrl;
    }
    // A relative override resolves against the document; a worker or a node
    // host has no `location`, so it is read defensively rather than assumed.
    const base = (globalThis as { location?: { href: string } }).location?.href;
    return new URL(descriptor.workerUrl, base);
  }
  return reactorMonitorWorkerUrl();
}

/** Facts for a worker whose build failed: nothing verified, nothing offered. */
const UNVERIFIED_INFO: ReactorInfo = Object.freeze({
  storage: UNKNOWN_STORAGE_FACTS,
  workflows: false,
  syncChannels: [],
  access: READ_ONLY_ACCESS,
});

/** Whether the worker built a different storage or local channel than asked. */
function describesDifferentBuild(
  descriptor: ReactorDescriptor,
  info: ReactorInfo,
): boolean {
  const persistence = (descriptor.storage ?? DEFAULT_REACTOR_STORAGE).kind;
  const wantsLocal =
    isLocalOnlySync(descriptor.sync?.local) ||
    descriptor.sync?.channelScheme !== null;
  return (
    persistence !== info.storage.persistence ||
    wantsLocal !== info.syncChannels.includes(LOCAL_CHANNEL_TYPE)
  );
}

export type ProvisionWorkerOptions = {
  /** Observes the host's reload (retirement); {@link onUnrecoverable} follows. */
  onReload?: (reason: string, workerGen?: string) => void;
  /** The worker retired (poison, restart, version skew); the handle is dead. */
  onUnrecoverable?: (cause: Error) => void;
  /**
   * Fingerprint the worker pins its build to. A tab whose id differs from
   * the worker's baseline is told to reload, which is how a stale worker is
   * replaced. Defaults to the library version, which does NOT vary per dev
   * build.
   */
  buildId?: string;
  /** Run when `kill()` releases the connection; the worker path has none. */
  onKill?: () => void;
};

/**
 * Builds the client-side view of a worker-hosted reactor over an already-open
 * transport.
 *
 * Takes the transport rather than making one so the whole tab side — hello
 * fingerprint, client proxy, event-bus proxy, sync proxy, inspector proxy,
 * admin channel — can be driven over a `MessageChannel` against a
 * `createMonitorWorkerHost()` in a unit test, which is the only way to test
 * it: there is no `SharedWorker` outside a browser.
 */
export async function connectManagedWorkerReactor(
  descriptor: ReactorDescriptor,
  transport: IRpcTransport,
  options: ProvisionWorkerOptions = {},
): Promise<ManagedWorkerReactor> {
  const router = new MessageRouter();
  router.attach(transport);

  // Tab-local registry: reducers and editors cannot cross the worker
  // boundary, so the tab keeps its own copy of the modules it knows about.
  const documentModelModules =
    descriptor.documentModelModules ?? baseDocumentModels;
  const documentModelRegistry = new DocumentModelRegistry();
  documentModelRegistry.registerModules(...documentModelModules);
  if (descriptor.upgradeManifests?.length) {
    documentModelRegistry.registerUpgradeManifests(
      ...descriptor.upgradeManifests,
    );
  }

  const featureFlags = descriptor.featureFlags ?? {};
  // The retirement kills the handle before the restart reply lands.
  let onRetired: (() => void) | undefined;
  const client = connectReactorClient(
    router,
    {
      version: {
        appBuildId: options.buildId ?? ReactorMonitorVersion,
        rpcProtocolVersion: RPC_PROTOCOL_VERSION,
        models: documentModelModules.map((m) => ({
          id: m.documentModel.global.id,
          version: m.version ?? 1,
        })),
        featureFlags: enabledFlagList(featureFlags),
      },
      construct: toWorkerConstruct(descriptor),
      packages: descriptor.packages?.specs ?? [],
    },
    (reason, workerGen) => {
      onRetired?.();
      options.onReload?.(reason, workerGen);
      const cause = new Error(
        `The worker hosting "${descriptor.name}" retired: ${reason}`,
      );
      if (options.onUnrecoverable) {
        options.onUnrecoverable(cause);
        return;
      }
      console.warn(
        `[reactor-monitor] ${cause.message}. Kill and re-provision this reactor.`,
      );
    },
    documentModelRegistry,
  );

  const eventBus = createReactorEventBusProxy(router);
  const syncManager = new SyncManagerProxy(router, eventBus);
  const inspector = createInspectorProxy(router);
  const adminClient = createWorkerAdminClient(router);

  const module: MonitorWorkerClientModule = {
    kind: "worker",
    client,
    adminClient,
    inspector,
    reactorModule: {
      documentModelRegistry,
      syncModule: { syncManager },
      eventBus,
    },
    registerPackages: async (sources: WorkerPackageSource[]) => {
      await router.request((id) => ({
        k: "register-packages",
        id,
        specs: [],
        sources,
      }));
    },
  };

  let info: ReactorInfo;
  let verified = true;
  try {
    info = await inspector.info();
  } catch (error) {
    verified = false;
    info = UNVERIFIED_INFO;
    console.warn(
      `[reactor-monitor] could not read "${descriptor.name}"'s info; offering no levers, no SQL and no local sync:`,
      error,
    );
  }
  const descriptorMismatch =
    verified && describesDifferentBuild(descriptor, info);
  if (descriptorMismatch) {
    console.warn(
      `[reactor-monitor] "${descriptor.name}" connected with a descriptor that disagrees with the worker's built reactor ` +
        `(built storage "${info.storage.persistence}", sync [${info.syncChannels.join(", ")}]); its info describes what was built.`,
    );
  }

  const localSync = info.syncChannels.includes(LOCAL_CHANNEL_TYPE)
    ? {
        /** Moves (not clones) one end of the broker's channel into the worker. */
        adoptLocalSyncPeer: (link: AdoptLocalSyncPeerLink): Promise<void> =>
          sendAdoptSyncPeer(
            router,
            {
              peerId: link.peerId,
              channelName: link.channelName,
              collectionIdKey: link.collectionId.key,
              remoteName: link.remoteName,
              filter: link.filter,
            },
            link.port as unknown as MessagePort,
          ),
        removeLocalSyncPeer: (
          remoteName: string,
          peerId: string,
          channelName: string,
        ): Promise<void> =>
          sendRemoveSyncPeer(router, { peerId, channelName, remoteName }),
      }
    : undefined;

  let killed = false;
  return {
    name: descriptor.name,
    kind: "worker",
    reach: { hosting: "worker", inspection: "rpc" },
    info,
    descriptorMismatch,
    client,
    inspector: toMonitorInspector(inspector),
    ...(info.access.admin ? { admin: inspector } : {}),
    ...(info.access.sql
      ? {
          dbQuery: {
            queryDb: (sql: string, params?: unknown[]) =>
              inspector.queryReactorDb(sql, params),
          },
        }
      : {}),
    syncManager: toMonitorSyncManager(syncManager, syncManager),
    ...(info.access.admin ? { syncAdmin: syncManager } : {}),
    events: eventBus,
    module,
    ...(localSync ?? {}),
    adminInfo: () => adminClient.info(),
    restart: () =>
      new Promise<void>((resolve, reject) => {
        onRetired = resolve;
        adminClient.restart().then(resolve, reject);
      }),
    /**
     * Releases this client's end of the connection. A SharedWorker cannot be
     * terminated by a client — the browser tears it down once no port is
     * connected, so dropping ours is the whole teardown this side owns. The
     * reactor's store is closed by the worker when it exits.
     */
    kill: () => {
      if (!killed) {
        killed = true;
        router.detach();
        transport.close();
        options.onKill?.();
      }
      return Promise.resolve();
    },
    isShutdown: () => killed,
  };
}

/**
 * Provisions a reactor hosted in a SharedWorker.
 *
 * The tab-side half of `reactor-monitor.worker.ts`, modelled on
 * `apps/connect/src/reactor-worker-client.ts` minus Renown identity posting,
 * the relational PGlite proxy, the on-demand model resolver and the liveness
 * ping loop. Everything after the worker exists is
 * {@link connectManagedWorkerReactor}.
 *
 * The worker comes from `descriptor.createWorker` when given — the seam a
 * bundled app should use — else from `descriptor.workerUrl`, else from this
 * package's own entry. See {@link reactorMonitorWorkerUrl}.
 */
export function provisionWorkerReactor(
  descriptor: ReactorDescriptor,
  options: ProvisionWorkerOptions = {},
): Promise<ManagedWorkerReactor> {
  const gen = readWorkerGen(descriptor.name);
  const name = reactorWorkerName(descriptor.name, gen);
  let worker: SharedWorker;
  let from: string;
  if (descriptor.createWorker) {
    worker = descriptor.createWorker(name);
    from = "the descriptor's createWorker";
  } else {
    if (typeof SharedWorker === "undefined") {
      throw new Error(
        `Cannot provision worker reactor "${descriptor.name}": SharedWorker is not available in this environment. Use kind "in-process" instead.`,
      );
    }
    const workerUrl = resolveWorkerUrl(descriptor);
    worker = new SharedWorker(workerUrl, { name, type: "module" });
    from = workerUrl.href;
  }
  worker.addEventListener("error", (event) => {
    console.error(
      `[reactor-monitor] SharedWorker ${name} failed to load from ${from}`,
      event.message || event,
    );
  });
  worker.port.onmessageerror = (event) => {
    console.error(
      `[reactor-monitor] port message for ${name} could not be deserialized`,
      event,
    );
  };

  return connectManagedWorkerReactor(
    descriptor,
    createPortTransport(worker.port),
    {
      ...options,
      onReload: (reason, workerGen) => {
        // Before onUnrecoverable, so a re-provision lands on the new gen.
        if (workerGen) {
          adoptWorkerGen(descriptor.name, gen, workerGen);
        }
        options.onReload?.(reason, workerGen);
      },
    },
  );
}
