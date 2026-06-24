import {
  DocumentModelRegistry,
  DocumentModelResolver,
  ReactorEventTypes,
  type IDocumentModelLoader,
  type ModelLoadedEvent,
} from "@powerhousedao/reactor";
import type { WorkerReactorClientModule } from "@powerhousedao/reactor-browser";
import {
  connectReactorClient,
  createPortTransport,
  createReactorEventBusProxy,
  postReactorIdentity,
  RPC_PROTOCOL_VERSION,
  SyncManagerProxy,
  type ReactorIdentity,
} from "@powerhousedao/reactor-browser/rpc";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { IRenown, User } from "@renown/sdk";
import { getGitSha, getVersion } from "./utils/build-info.js";

export type WorkerReactorClientArgs = {
  namespace: string;
  cdnUrl: string;
  packageSpecs: string[];
  documentModelModules: DocumentModelModule[];
  upgradeManifests: UpgradeManifest<readonly number[]>[];
  documentModelLoader: IDocumentModelLoader;
  renown: IRenown;
  onReload: (reason: string) => void;
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
  const worker = new SharedWorker(
    new URL("./reactor.worker.js", import.meta.url),
    { name: `ph-reactor:${args.namespace}`, type: "module" },
  );
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

  postReactorIdentity(transport, toReactorIdentity(args.renown.user));
  args.renown.on("user", (user) =>
    postReactorIdentity(transport, toReactorIdentity(user)),
  );

  const reactorClientModule: WorkerReactorClientModule = {
    kind: "worker",
    client: clientProxy,
    reactorModule: {
      documentModelRegistry,
      syncModule: { syncManager: syncManagerProxy },
      eventBus: busProxy,
    },
  };

  return { reactorClientModule, syncManagerProxy };
}
