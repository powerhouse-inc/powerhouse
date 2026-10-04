import {
  DocumentModelRegistry,
  type ReactorFeatureFlags,
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
import { reactorWorkerName } from "../naming.js";
import type { AdoptLocalSyncPeerLink } from "../sync/types.js";
import type {
  ManagedWorkerReactor,
  MonitorWorkerClientModule,
  ReactorDescriptor,
} from "../types.js";
import { toWorkerConstruct } from "./construct.js";
import { ReactorMonitorVersion } from "../version.js";
import { reactorMonitorWorkerUrl } from "../worker-url.js";

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

export type ProvisionWorkerOptions = {
  /**
   * Called when the host asks its clients to reload (a version-fingerprint
   * mismatch, or an admin restart). The monitor's answer is to kill and
   * re-provision this reactor; there is no page to reload.
   */
  onReload?: (reason: string, workerGen?: string) => void;
  /**
   * Fingerprint the worker pins its build to. A tab whose id differs from
   * the worker's baseline is told to reload, which is how a stale worker is
   * replaced. Defaults to the library version, which does NOT vary per dev
   * build — see W0.6 in the multi-reactor plan.
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
export function connectManagedWorkerReactor(
  descriptor: ReactorDescriptor,
  transport: IRpcTransport,
  options: ProvisionWorkerOptions = {},
): ManagedWorkerReactor {
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
    options.onReload ??
      ((reason, workerGen) => {
        console.warn(
          `[reactor-monitor] host of "${descriptor.name}" asked its clients to reload: ${reason}${
            workerGen ? ` (gen ${workerGen})` : ""
          }. Kill and re-provision this reactor to pick it up.`,
        );
      }),
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

  // Exposed only when the worker was provisioned with sync.local, matching the
  // in-process handle exactly. Without the conditional, linkLocalSync's
  // requireLocalCapable() saw two methods on every worker reactor and only
  // found out the worker had no local sync module after a port had been opened
  // and transferred -- a failure with side effects where a fail-fast belonged.
  const localSync = descriptor.sync?.local
    ? {
        /**
         * Transfers one end of the broker's MessageChannel into the worker and
         * adds the local remote there via the adopt-sync-peer op. The port is
         * MOVED, not cloned; this handle must not touch it afterwards. The
         * transferred-MessagePort path needs a real browser (W1.3).
         */
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
        /**
         * Removes the local remote AND unregisters its port inside the worker,
         * over the remove-sync-peer op. The registry lives in the worker realm,
         * so the tab cannot unregister anything itself; removing the remote
         * over the plain sync-op channel left a dead port registered there.
         */
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
    client,
    inspector,
    dbQuery: {
      queryDb: (sql, params) => inspector.queryReactorDb(sql, params),
    },
    syncManager,
    events: eventBus,
    module,
    ...(localSync ?? {}),
    adminInfo: () => adminClient.info(),
    restart: () => adminClient.restart(),
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
): ManagedWorkerReactor {
  const name = reactorWorkerName(descriptor.name);
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
    options,
  );
}
