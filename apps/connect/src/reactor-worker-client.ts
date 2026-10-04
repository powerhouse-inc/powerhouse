import {
  DocumentModelRegistry,
  DocumentModelResolver,
  ReactorEventTypes,
  type IDocumentModelLoader,
  type ModelLoadedEvent,
  type ReactorFeatureFlags,
  type UnsupportedStoredDocuments,
} from "@powerhousedao/reactor";
import {
  setPGliteDB,
  type WorkerReactorClientModule,
} from "@powerhousedao/reactor-browser";
import {
  connectReactorClient,
  createInspectorProxy,
  createPortTransport,
  createReactorEventBusProxy,
  createRelationalPgliteProxy,
  createWorkerAdminClient,
  MessageRouter,
  postReactorIdentity,
  RPC_PROTOCOL_VERSION,
  SyncManagerProxy,
  type ReactorIdentity,
  type WorkerPackageSource,
} from "@powerhousedao/reactor-browser/rpc";
import type {
  DocumentModelModule,
  SignaturePolicy,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { IRenown, User } from "@renown/sdk";
import {
  getWorkerConnectionStatus,
  setWorkerConnectionStatus,
} from "./connection-state.js";
import { reactorWorkerName } from "./reactor-worker-name.js";
import { getAppBuildId } from "./utils/build-info.js";
import type { RenownTrustEndpoints } from "./utils/renown-trust.js";

const PING_INTERVAL_MS = 2000;
const PING_DEADLINE_MS = 3000;
const MAX_MISSED_PINGS = 2;

export type WorkerReactorClientArgs = {
  namespace: string;
  relationalNamespace: string;
  cdnUrl: string;
  packageSpecs: string[];
  /** Absolute-URL shared-deps import map (from the production vendor); the
   *  worker rewrites package sources to these URLs and blob-imports them. */
  sharedImports?: Record<string, string>;
  studioMode?: boolean;
  /** Loads the workflow package's document models. Independent of studioMode. */
  workflowsEnabled?: boolean;
  /** Chain the worker's bearer tokens are scoped to; matches the main thread's Renown instance. */
  renownChainId?: number;
  /** Enforcement flags for the worker's reactor; it has no runtime config to read them from. */
  featureFlags: Partial<ReactorFeatureFlags>;
  /** The resolved multiReactor flag; the worker has no runtime config to read it from. */
  multiReactor: boolean;
  /** What the worker's client creates new documents as. */
  createSignaturePolicy?: SignaturePolicy;
  /** Whether the worker boots over stored documents this build does not run. */
  unsupportedStoredDocuments?: UnsupportedStoredDocuments;
  /** Where the worker's trust policy verifies signers under authEnforcement. */
  renownEndpoints?: RenownTrustEndpoints;
  documentModelModules: DocumentModelModule[];
  upgradeManifests: UpgradeManifest<readonly number[]>[];
  documentModelLoader: IDocumentModelLoader;
  renown: IRenown;
  onReload: (reason: string, workerGen?: string) => void;
  /**
   * URL of the prebuilt worker bundle (packaged deployments). Absent, the
   * worker script resolves relative to this module, which only works where
   * Vite bundles the worker from source (the monorepo app).
   */
  workerUrl?: string;
  /**
   * URL-addressed packages the worker loads at boot: local project models
   * the registry cannot serve. See resolveLocalPackageSources.
   */
  packageSources?: WorkerPackageSource[];
  /**
   * The resolved worker bundle's build digest (see
   * `fetchReactorWorkerBuildDigest` in `./utils/reactor-worker-url.js`), sent
   * as the fingerprint's own `buildDigest` field so a rebuilt dev bundle lands
   * tabs on a fresh worker. Null where the deployment serves no bundle, where
   * a baked-in git sha makes the token unnecessary, or where the fetch did not
   * resolve — the host reads an absent token as unknown, not as a different
   * build.
   */
  workerBuildDigest?: string | null;
};

export type WorkerReactorClient = {
  reactorClientModule: WorkerReactorClientModule;
  syncManagerProxy: SyncManagerProxy;
  dispose: () => void;
};

/** Sorted so the same set always produces the same fingerprint. */
function enabledFlagList(flags: Partial<ReactorFeatureFlags>): string {
  return Object.entries(flags)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .sort()
    .join(",");
}

/**
 * The construct message the worker's `build` reads. Flags the worker has no
 * runtime config to resolve for itself -- featureFlags, multiReactor, ... -- are
 * threaded here from the tab. Extracted so the flag threading is unit-testable
 * without constructing a real SharedWorker.
 */
export function buildWorkerConstruct(args: WorkerReactorClientArgs) {
  return {
    namespace: args.namespace,
    relationalNamespace: args.relationalNamespace,
    cdnUrl: args.cdnUrl,
    packageSpecs: args.packageSpecs,
    sharedImports: args.sharedImports,
    studioMode: args.studioMode,
    workflowsEnabled: args.workflowsEnabled,
    renownChainId: args.renownChainId,
    featureFlags: args.featureFlags,
    multiReactor: args.multiReactor,
    createSignaturePolicy: args.createSignaturePolicy,
    unsupportedStoredDocuments: args.unsupportedStoredDocuments,
    renownEndpoints: args.renownEndpoints,
    packageSources: args.packageSources,
  };
}

function toReactorIdentity(user: User | undefined): ReactorIdentity | null {
  if (!user) {
    return null;
  }
  return {
    address: user.address,
    chainId: user.chainId,
    networkId: user.networkId,
  };
}

export function createWorkerReactorClientModule(
  args: WorkerReactorClientArgs,
): WorkerReactorClient {
  const workerUrl = args.workerUrl
    ? new URL(args.workerUrl)
    : new URL("./reactor.worker.js", import.meta.url);
  console.info(
    `[reactor-worker] constructing SharedWorker ${reactorWorkerName(
      args.namespace,
    )} from ${workerUrl.href}`,
  );
  const worker = new SharedWorker(workerUrl, {
    name: reactorWorkerName(args.namespace),
    type: "module",
  });
  worker.addEventListener("error", (event) => {
    console.error(
      `[reactor-worker] SharedWorker failed to load from ${workerUrl.href}`,
      event.message || event,
    );
    // A load failure never pongs; report it now instead of making the user
    // wait out the ping deadline for a generic "stopped responding".
    setWorkerConnectionStatus("failed");
  });
  worker.port.onmessageerror = (event) => {
    console.error(
      "[reactor-worker] port message could not be deserialized",
      event,
    );
  };
  const transport = createPortTransport(worker.port);
  const router = new MessageRouter();
  router.attach(transport);

  const documentModelRegistry = new DocumentModelRegistry();
  documentModelRegistry.registerModules(...args.documentModelModules);
  documentModelRegistry.registerUpgradeManifests(...args.upgradeManifests);

  const clientProxy = connectReactorClient(
    router,
    {
      version: {
        appBuildId: getAppBuildId(),
        buildDigest: args.workerBuildDigest ?? undefined,
        rpcProtocolVersion: RPC_PROTOCOL_VERSION,
        models: args.documentModelModules.map((m) => ({
          id: m.documentModel.global.id,
          version: m.version ?? 1,
        })),
        featureFlags: enabledFlagList(args.featureFlags),
      },
      construct: buildWorkerConstruct(args),
      packages: args.packageSpecs,
    },
    args.onReload,
    documentModelRegistry,
  );

  const busProxy = createReactorEventBusProxy(router);
  const syncManagerProxy = new SyncManagerProxy(router, busProxy);

  // Keep the tab registry synced with the worker's on-demand loads.
  const modelResolver = new DocumentModelResolver(
    documentModelRegistry,
    args.documentModelLoader,
  );
  busProxy.subscribe(ReactorEventTypes.MODEL_LOADED, (_type, event) => {
    const { documentType } = event as ModelLoadedEvent;
    void modelResolver.ensureModelLoaded(documentType).catch((error) => {
      console.error(
        `Failed to load model "${documentType}" into tab registry`,
        error,
      );
    });
  });

  // Seed the relational read surface the relational hooks read (SELECT + live, no raw PGlite).
  setPGliteDB({
    db: createRelationalPgliteProxy(router),
    isLoading: false,
    error: null,
  });

  postReactorIdentity(router, toReactorIdentity(args.renown.user));
  args.renown.on("user", (user) =>
    postReactorIdentity(router, toReactorIdentity(user)),
  );

  const reactorClientModule: WorkerReactorClientModule = {
    kind: "worker",
    client: clientProxy,
    adminClient: createWorkerAdminClient(router),
    inspector: createInspectorProxy(router),
    registerPackages: async (sources: WorkerPackageSource[]) => {
      await router.request((id) => ({
        k: "register-packages",
        id,
        specs: [],
        sources,
      }));
    },
    reactorModule: {
      documentModelRegistry,
      syncModule: { syncManager: syncManagerProxy },
      eventBus: busProxy,
    },
  };

  let pingCounter = 0;
  let missedPings = 0;
  const pingDeadlines = new Map<string, ReturnType<typeof setTimeout>>();

  router.on("pong", (msg) => {
    const timer = pingDeadlines.get(msg.id);
    if (timer === undefined) {
      return;
    }
    clearTimeout(timer);
    pingDeadlines.delete(msg.id);
    missedPings = 0;
    setWorkerConnectionStatus("connected");
  });

  const pingInterval = setInterval(() => {
    const id = `ping${++pingCounter}`;
    const timer = setTimeout(() => {
      pingDeadlines.delete(id);
      missedPings += 1;
      // "failed" (the worker script never loaded) is more specific than
      // "lost" and must not be downgraded by the ping deadline.
      if (
        missedPings >= MAX_MISSED_PINGS &&
        getWorkerConnectionStatus() !== "failed"
      ) {
        setWorkerConnectionStatus("lost");
      }
    }, PING_DEADLINE_MS);
    pingDeadlines.set(id, timer);
    router.post({ k: "ping", id });
  }, PING_INTERVAL_MS);

  const dispose = () => {
    clearInterval(pingInterval);
    for (const timer of pingDeadlines.values()) {
      clearTimeout(timer);
    }
    pingDeadlines.clear();
  };

  return { reactorClientModule, syncManagerProxy, dispose };
}
