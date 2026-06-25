import {
  DocumentModelRegistry,
  DocumentModelResolver,
  ReactorEventTypes,
  type IDocumentModelLoader,
  type ModelLoadedEvent,
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
  postReactorIdentity,
  RPC_PROTOCOL_VERSION,
  SyncManagerProxy,
  type OwnerMessage,
  type ReactorIdentity,
} from "@powerhousedao/reactor-browser/rpc";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { IRenown, User } from "@renown/sdk";
import { setWorkerConnectionStatus } from "./connection-state.js";
import { reactorWorkerName } from "./reactor-worker-name.js";
import { getGitSha, getVersion } from "./utils/build-info.js";

const PING_INTERVAL_MS = 2000;
const PING_DEADLINE_MS = 3000;
const MAX_MISSED_PINGS = 2;

export type WorkerReactorClientArgs = {
  namespace: string;
  relationalNamespace: string;
  cdnUrl: string;
  packageSpecs: string[];
  documentModelModules: DocumentModelModule[];
  upgradeManifests: UpgradeManifest<readonly number[]>[];
  documentModelLoader: IDocumentModelLoader;
  renown: IRenown;
  onReload: (reason: string, workerGen?: string) => void;
};

export type WorkerReactorClient = {
  reactorClientModule: WorkerReactorClientModule;
  syncManagerProxy: SyncManagerProxy;
};

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
  const workerUrl = new URL("./reactor.worker.js", import.meta.url);
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
  });
  worker.port.onmessageerror = (event) => {
    console.error(
      "[reactor-worker] port message could not be deserialized",
      event,
    );
  };
  const transport = createPortTransport(worker.port);

  const documentModelRegistry = new DocumentModelRegistry();
  documentModelRegistry.registerModules(...args.documentModelModules);
  documentModelRegistry.registerUpgradeManifests(...args.upgradeManifests);

  const gitSha = getGitSha();
  const clientProxy = connectReactorClient(
    transport,
    {
      version: {
        appBuildId: gitSha !== "unknown" ? gitSha : getVersion(),
        rpcProtocolVersion: RPC_PROTOCOL_VERSION,
        models: args.documentModelModules.map((m) => ({
          id: m.documentModel.global.id,
          version: m.version ?? 1,
        })),
      },
      construct: {
        namespace: args.namespace,
        relationalNamespace: args.relationalNamespace,
        cdnUrl: args.cdnUrl,
        packageSpecs: args.packageSpecs,
      },
      packages: args.packageSpecs,
    },
    args.onReload,
    documentModelRegistry,
  );

  const busProxy = createReactorEventBusProxy(transport);
  const syncManagerProxy = new SyncManagerProxy(transport, busProxy);

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
    db: createRelationalPgliteProxy(transport),
    isLoading: false,
    error: null,
  });

  postReactorIdentity(transport, toReactorIdentity(args.renown.user));
  args.renown.on("user", (user) =>
    postReactorIdentity(transport, toReactorIdentity(user)),
  );

  const reactorClientModule: WorkerReactorClientModule = {
    kind: "worker",
    client: clientProxy,
    adminClient: createWorkerAdminClient(transport),
    inspector: createInspectorProxy(transport),
    reactorModule: {
      documentModelRegistry,
      syncModule: { syncManager: syncManagerProxy },
      eventBus: busProxy,
    },
  };

  let pingCounter = 0;
  let missedPings = 0;
  const pingDeadlines = new Map<string, ReturnType<typeof setTimeout>>();

  transport.onMessage((message) => {
    const msg = message as OwnerMessage;
    if (msg.k !== "pong") {
      return;
    }
    const timer = pingDeadlines.get(msg.id);
    if (timer !== undefined) {
      clearTimeout(timer);
      pingDeadlines.delete(msg.id);
    }
    missedPings = 0;
    setWorkerConnectionStatus("connected");
  });

  setInterval(() => {
    const id = `ping${++pingCounter}`;
    const timer = setTimeout(() => {
      pingDeadlines.delete(id);
      missedPings += 1;
      if (missedPings >= MAX_MISSED_PINGS) {
        setWorkerConnectionStatus("lost");
      }
    }, PING_DEADLINE_MS);
    pingDeadlines.set(id, timer);
    transport.post({ k: "ping", id });
  }, PING_INTERVAL_MS);

  return { reactorClientModule, syncManagerProxy };
}
