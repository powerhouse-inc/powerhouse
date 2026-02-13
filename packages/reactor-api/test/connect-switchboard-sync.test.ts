import {
  CompositeChannelFactory,
  ConsoleLogger,
  driveCollectionId,
  EventBus,
  JobStatus,
  ReactorBuilder,
  ReactorEventTypes,
  SyncBuilder,
  type IEventBus,
  type IReactor,
  type ISyncManager,
  type JobReadReadyEvent,
  type ReactorModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "document-drive";
import type { DocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { createResolverBridge } from "./utils/gql-resolver-bridge.js";

type ConnectSwitchboardSetup = {
  connectReactor: IReactor;
  switchboardReactor: IReactor;
  connectModule: ReactorModule;
  switchboardModule: ReactorModule;
  connectEventBus: IEventBus;
  switchboardEventBus: IEventBus;
  connectSyncManager: ISyncManager;
  switchboardSyncManager: ISyncManager;
  resolverBridge: typeof fetch;
};

async function setupConnectSwitchboard(): Promise<ConnectSwitchboardSetup> {
  const syncManagerRegistry = new Map<string, ISyncManager>();
  const resolverBridge = createResolverBridge(syncManagerRegistry);

  const logger = new ConsoleLogger(["test"]);

  const connectEventBus = new EventBus();
  const switchboardEventBus = new EventBus();

  const connectModule = await new ReactorBuilder()
    .withEventBus(connectEventBus)
    .withDocumentModels([
      driveDocumentModelModule as unknown as DocumentModelModule,
    ])
    .withSync(
      new SyncBuilder().withChannelFactory(new CompositeChannelFactory(logger)),
    )
    .buildModule();

  const switchboardModule = await new ReactorBuilder()
    .withEventBus(switchboardEventBus)
    .withDocumentModels([
      driveDocumentModelModule as unknown as DocumentModelModule,
    ])
    .withSync(
      new SyncBuilder().withChannelFactory(new CompositeChannelFactory(logger)),
    )
    .buildModule();

  const switchboardSyncManager = switchboardModule.syncModule!.syncManager;
  syncManagerRegistry.set("switchboard", switchboardSyncManager);

  const connectSyncManager = connectModule.syncModule!.syncManager;

  return {
    connectReactor: connectModule.reactor,
    switchboardReactor: switchboardModule.reactor,
    connectModule,
    switchboardModule,
    connectEventBus,
    switchboardEventBus,
    connectSyncManager,
    switchboardSyncManager,
    resolverBridge,
  };
}

async function setupSyncForDrive(
  connectSyncManager: ISyncManager,
  driveId: string,
  resolverBridge: typeof fetch,
): Promise<void> {
  const collectionId = driveCollectionId("main", driveId);

  await connectSyncManager.add(
    `switchboard-${driveId}`,
    collectionId,
    {
      type: "gql",
      parameters: {
        url: "http://switchboard/graphql",
        pollIntervalMs: 100,
        maxFailures: 10,
        retryBaseDelayMs: 50,
        fetchFn: resolverBridge,
      },
    },
    {
      documentId: [],
      scope: [],
      branch: "main",
    },
  );
}

async function waitForJobCompletion(
  reactor: IReactor,
  jobId: string,
  timeoutMs = 10000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await reactor.getJobStatus(jobId);
    if (
      status.status === JobStatus.READ_READY ||
      status.status === JobStatus.FAILED
    ) {
      if (status.status === JobStatus.FAILED) {
        throw new Error(
          `Job ${jobId} failed: ${status.error?.message ?? "unknown"}`,
        );
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

function waitForOperationsReady(
  eventBus: IEventBus,
  documentId: string,
  timeoutMs = 15000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;

    const timer = setTimeout(() => {
      unsubscribe?.();
      reject(
        new Error(`Timed out waiting for operations on document ${documentId}`),
      );
    }, timeoutMs);

    unsubscribe = eventBus.subscribe(
      ReactorEventTypes.JOB_READ_READY,
      (_type: number, event: JobReadReadyEvent) => {
        const matchesDocument = event.operations.some(
          (op) => op.context.documentId === documentId,
        );
        if (matchesDocument) {
          clearTimeout(timer);
          unsubscribe?.();
          resolve();
        }
      },
    );
  });
}

describe("Connect-Switchboard Sync", () => {
  let connectReactor: IReactor;
  let switchboardReactor: IReactor;
  let connectModule: ReactorModule;
  let switchboardModule: ReactorModule;
  let connectEventBus: IEventBus;
  let switchboardEventBus: IEventBus;
  let connectSyncManager: ISyncManager;
  let switchboardSyncManager: ISyncManager;
  let resolverBridge: typeof fetch;

  afterEach(() => {
    connectReactor.kill();
    switchboardReactor.kill();
  });

  it("should sync operation from Connect to Switchboard", async () => {
    const setup = await setupConnectSwitchboard();
    connectReactor = setup.connectReactor;
    switchboardReactor = setup.switchboardReactor;
    connectModule = setup.connectModule;
    switchboardModule = setup.switchboardModule;
    connectEventBus = setup.connectEventBus;
    switchboardEventBus = setup.switchboardEventBus;
    connectSyncManager = setup.connectSyncManager;
    switchboardSyncManager = setup.switchboardSyncManager;
    resolverBridge = setup.resolverBridge;

    const document = driveDocumentModelModule.utils.createDocument({
      global: {
        name: "Test Drive???",
        icon: null,
        nodes: [],
      },
    });
    const documentId = document.header.id;

    await setupSyncForDrive(connectSyncManager, documentId, resolverBridge);

    const readyOnSwitchboard = waitForOperationsReady(
      switchboardEventBus,
      documentId,
    );

    const jobInfo = await connectReactor.create(document);
    await waitForJobCompletion(connectReactor, jobInfo.id);

    await readyOnSwitchboard;

    const connectOps = await connectReactor.getOperations(documentId, {
      branch: "main",
    });
    const switchboardOps = await switchboardReactor.getOperations(documentId, {
      branch: "main",
    });

    const connectOpsList = Object.values(connectOps).flatMap(
      (scope) => scope.results,
    );
    const switchboardOpsList = Object.values(switchboardOps).flatMap(
      (scope) => scope.results,
    );

    expect(connectOpsList.length).toBeGreaterThan(0);
    expect(switchboardOpsList.length).toBe(connectOpsList.length);

    for (let i = 0; i < connectOpsList.length; i++) {
      expect(switchboardOpsList[i]).toEqual(connectOpsList[i]);
    }

    const connectDoc = await connectReactor.get(documentId, {
      branch: "main",
    });
    const switchboardDoc = await switchboardReactor.get(documentId, {
      branch: "main",
    });

    expect(connectDoc.state).toEqual(switchboardDoc.state);
  }, 30000);

  it("should sync operation from Switchboard to Connect", async () => {
    const setup = await setupConnectSwitchboard();
    connectReactor = setup.connectReactor;
    switchboardReactor = setup.switchboardReactor;
    connectModule = setup.connectModule;
    switchboardModule = setup.switchboardModule;
    connectEventBus = setup.connectEventBus;
    switchboardEventBus = setup.switchboardEventBus;
    connectSyncManager = setup.connectSyncManager;
    switchboardSyncManager = setup.switchboardSyncManager;
    resolverBridge = setup.resolverBridge;

    const document = driveDocumentModelModule.utils.createDocument({
      global: {
        name: "Test Drive???",
        icon: null,
        nodes: [],
      },
    });
    const documentId = document.header.id;

    // Need a document on Connect first to set up the sync channel
    await setupSyncForDrive(connectSyncManager, documentId, resolverBridge);

    // Create document on Switchboard
    const readyOnConnect = waitForOperationsReady(connectEventBus, documentId);

    const jobInfo = await switchboardReactor.create(document);
    await waitForJobCompletion(switchboardReactor, jobInfo.id);

    // Connect polls Switchboard's outbox
    await readyOnConnect;

    const connectOps = await connectReactor.getOperations(documentId, {
      branch: "main",
    });
    const switchboardOps = await switchboardReactor.getOperations(documentId, {
      branch: "main",
    });

    const connectOpsList = Object.values(connectOps).flatMap(
      (scope) => scope.results,
    );
    const switchboardOpsList = Object.values(switchboardOps).flatMap(
      (scope) => scope.results,
    );

    expect(switchboardOpsList.length).toBeGreaterThan(0);
    expect(connectOpsList.length).toBe(switchboardOpsList.length);

    for (let i = 0; i < switchboardOpsList.length; i++) {
      expect(connectOpsList[i]).toEqual(switchboardOpsList[i]);
    }

    const connectDoc = await connectReactor.get(documentId, {
      branch: "main",
    });
    const switchboardDoc = await switchboardReactor.get(documentId, {
      branch: "main",
    });

    expect(connectDoc.state).toEqual(switchboardDoc.state);
  }, 30000);

  it("should sync mutations from Connect to Switchboard", async () => {
    const setup = await setupConnectSwitchboard();
    connectReactor = setup.connectReactor;
    switchboardReactor = setup.switchboardReactor;
    connectModule = setup.connectModule;
    switchboardModule = setup.switchboardModule;
    connectEventBus = setup.connectEventBus;
    switchboardEventBus = setup.switchboardEventBus;
    connectSyncManager = setup.connectSyncManager;
    switchboardSyncManager = setup.switchboardSyncManager;
    resolverBridge = setup.resolverBridge;

    const document = driveDocumentModelModule.utils.createDocument();
    const documentId = document.header.id;

    await setupSyncForDrive(connectSyncManager, documentId, resolverBridge);

    // Step 1: Create document on Connect, sync to Switchboard
    const createReady = waitForOperationsReady(switchboardEventBus, documentId);
    const createJob = await connectReactor.create(document);
    await waitForJobCompletion(connectReactor, createJob.id);
    await createReady;

    // Step 2: Mutate on Connect
    const mutationReady = waitForOperationsReady(
      switchboardEventBus,
      documentId,
    );
    const mutateJob = await connectReactor.execute(documentId, "main", [
      driveDocumentModelModule.actions.setDriveName({ name: "Synced Drive" }),
    ]);
    await waitForJobCompletion(connectReactor, mutateJob.id);
    await mutationReady;

    // Step 3: Verify
    const connectDoc = await connectReactor.get(documentId, {
      branch: "main",
    });
    const switchboardDoc = await switchboardReactor.get(documentId, {
      branch: "main",
    });

    expect(connectDoc.state).toEqual(switchboardDoc.state);

    const state = connectDoc.state as unknown as {
      global: { name: string };
    };
    expect(state.global.name).toBe("Synced Drive");
  }, 30000);
});
