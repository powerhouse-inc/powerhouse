import {
  ConsoleLogger,
  driveCollectionId,
  EventBus,
  GqlRequestChannelFactory,
  GqlResponseChannelFactory,
  InMemoryQueue,
  JobStatus,
  NullDocumentModelResolver,
  ReactorBuilder,
  ReactorEventTypes,
  SyncBuilder,
  type IChannel,
  type IChannelFactory,
  type IEventBus,
  type IReactor,
  type ISyncManager,
  type JobReadReadyEvent,
  type OperationIndexEntry,
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

  const resolver = new NullDocumentModelResolver();
  const connectQueue = new InMemoryQueue(connectEventBus, resolver);
  const switchboardQueue = new InMemoryQueue(switchboardEventBus, resolver);

  // Both reactors need to handle "gql" (for active polling) and "polling"
  // (for touchChannel-created response channels) in bidirectional sync tests.
  function createCompositeFactory(queue: typeof connectQueue): IChannelFactory {
    const request = new GqlRequestChannelFactory(logger, undefined, queue);
    const response = new GqlResponseChannelFactory(logger);
    return {
      instance(...args): IChannel {
        const [remoteId, remoteName, config, cursorStorage] = args;
        if (config.type === "polling") {
          return response.instance(remoteId, remoteName, config, cursorStorage);
        }
        return request.instance(...args);
      },
    };
  }

  const connectModule = await new ReactorBuilder()
    .withEventBus(connectEventBus)
    .withQueue(connectQueue)
    .withDocumentModels([
      driveDocumentModelModule as unknown as DocumentModelModule,
    ])
    .withSync(
      new SyncBuilder().withChannelFactory(
        createCompositeFactory(connectQueue),
      ),
    )
    .buildModule();

  const switchboardModule = await new ReactorBuilder()
    .withEventBus(switchboardEventBus)
    .withQueue(switchboardQueue)
    .withDocumentModels([
      driveDocumentModelModule as unknown as DocumentModelModule,
    ])
    .withSync(
      new SyncBuilder().withChannelFactory(
        createCompositeFactory(switchboardQueue),
      ),
    )
    .buildModule();

  const switchboardSyncManager = switchboardModule.syncModule!.syncManager;
  syncManagerRegistry.set("switchboard", switchboardSyncManager);

  const connectSyncManager = connectModule.syncModule!.syncManager;
  syncManagerRegistry.set("connect", connectSyncManager);

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

async function setupSyncForDriveOnSwitchboard(
  switchboardSyncManager: ISyncManager,
  driveId: string,
  resolverBridge: typeof fetch,
): Promise<void> {
  const collectionId = driveCollectionId("main", driveId);
  await switchboardSyncManager.add(
    `connect-${driveId}`,
    collectionId,
    {
      type: "gql",
      parameters: {
        url: "http://connect/graphql",
        pollIntervalMs: 100,
        retryBaseDelayMs: 50,
        fetchFn: resolverBridge,
      },
    },
    { documentId: [], scope: [], branch: "main" },
  );
}

function waitForSyncStabilization(
  eventBuses: IEventBus[],
  quietPeriodMs = 500,
  timeoutMs = 15000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let lastActivityTime = Date.now();
    const unsubscribes: (() => void)[] = [];

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for sync stabilization"));
    }, timeoutMs);

    const checkQuiet = setInterval(() => {
      if (Date.now() - lastActivityTime >= quietPeriodMs) {
        cleanup();
        resolve();
      }
    }, 50);

    function cleanup() {
      clearTimeout(timer);
      clearInterval(checkQuiet);
      for (const unsub of unsubscribes) unsub();
    }

    for (const bus of eventBuses) {
      const unsub = bus.subscribe(ReactorEventTypes.JOB_READ_READY, () => {
        lastActivityTime = Date.now();
      });
      unsubscribes.push(unsub);
    }
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

  describe("sourceRemote echo prevention", () => {
    it("local mutations always have sourceRemote=''", async () => {
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
        global: { name: "Local Test", icon: null, nodes: [] },
      });
      const documentId = document.header.id;

      const createJob = await connectReactor.create(document);
      await waitForJobCompletion(connectReactor, createJob.id);

      const mutateJob = await connectReactor.execute(documentId, "main", [
        driveDocumentModelModule.actions.setDriveName({
          name: "Local Mutation",
        }),
      ]);
      await waitForJobCompletion(connectReactor, mutateJob.id);

      const indexResult = await connectModule.operationIndex.get(documentId);
      const entries = indexResult.results as OperationIndexEntry[];

      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.sourceRemote).toBe("");
      }
    }, 30000);

    it("trivial append operations are not echoed back to source", async () => {
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
        global: { name: "Echo Test", icon: null, nodes: [] },
      });
      const documentId = document.header.id;

      await setupSyncForDrive(connectSyncManager, documentId, resolverBridge);
      await setupSyncForDriveOnSwitchboard(
        switchboardSyncManager,
        documentId,
        resolverBridge,
      );

      const createOnSwitchboard = waitForOperationsReady(
        switchboardEventBus,
        documentId,
      );
      const createJob = await connectReactor.create(document);
      await waitForJobCompletion(connectReactor, createJob.id);
      await createOnSwitchboard;

      const mutationOnSwitchboard = waitForOperationsReady(
        switchboardEventBus,
        documentId,
      );
      const mutateJob = await connectReactor.execute(documentId, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "No Echo" }),
      ]);
      await waitForJobCompletion(connectReactor, mutateJob.id);
      await mutationOnSwitchboard;

      // Inspect Switchboard's sourceRemote values to understand the mechanism
      const switchboardIndex =
        await switchboardModule.operationIndex.get(documentId);
      const switchboardEntries =
        switchboardIndex.results as OperationIndexEntry[];
      const remoteEntries = switchboardEntries.filter(
        (e) => e.sourceRemote !== "",
      );
      expect(remoteEntries.length).toBeGreaterThan(0);

      // Verify the sourceRemote value on Switchboard.
      // Push-delivered ops get sourceRemote from the touchChannel resolver,
      // which uses the sender's remote name (e.g., "switchboard-{driveId}").
      // The outbox filters by excludeSourceRemote = remote.name
      // (e.g., "connect-{driveId}"). These don't match for push-delivered
      // ops, so echo prevention relies on dedup rather than outbox filtering.
      const sourceRemoteValues = [
        ...new Set(remoteEntries.map((e) => e.sourceRemote)),
      ];
      const connectRemoteName = `connect-${documentId}`;
      const pushSourceRemoteMatchesOutboxFilter = sourceRemoteValues.every(
        (v) => v === connectRemoteName,
      );

      // Verify the outbox filter behavior: query with the actual
      // excludeSourceRemote used by Switchboard's connect-{driveId} remote
      const collectionId = driveCollectionId("main", documentId);
      const filteredIndex = await switchboardModule.operationIndex.find(
        collectionId,
        0,
        { excludeSourceRemote: connectRemoteName },
      );

      if (!pushSourceRemoteMatchesOutboxFilter) {
        // Known issue: push-delivered ops have a different sourceRemote
        // than the outbox filter expects. The outbox filter does NOT
        // catch these ops; echo prevention relies on dedup instead.
        // The filtered result will include remote ops that should have
        // been filtered out.
        expect(filteredIndex.results.length).toBeGreaterThan(0);
      }

      const connectIndexBefore =
        await connectModule.operationIndex.get(documentId);
      const connectCountBefore = connectIndexBefore.results.length;

      await waitForSyncStabilization([connectEventBus, switchboardEventBus]);

      const connectIndexAfter =
        await connectModule.operationIndex.get(documentId);
      const connectCountAfter = connectIndexAfter.results.length;
      expect(connectCountAfter).toBe(connectCountBefore);

      const connectEntries = connectIndexAfter.results as OperationIndexEntry[];
      for (const entry of connectEntries) {
        expect(entry.sourceRemote).toBe("");
      }

      const connectDoc = await connectReactor.get(documentId, {
        branch: "main",
      });
      const switchboardDoc = await switchboardReactor.get(documentId, {
        branch: "main",
      });
      expect(connectDoc.state).toEqual(switchboardDoc.state);
    }, 30000);

    it("all-duplicate load job completes without wedging the queue", async () => {
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
        global: { name: "Wedge Test", icon: null, nodes: [] },
      });
      const documentId = document.header.id;

      // Unidirectional sync: Connect -> Switchboard
      await setupSyncForDrive(connectSyncManager, documentId, resolverBridge);

      const createOnSwitchboard = waitForOperationsReady(
        switchboardEventBus,
        documentId,
      );
      const createJob = await connectReactor.create(document);
      await waitForJobCompletion(connectReactor, createJob.id);
      await createOnSwitchboard;

      // Mutate on Connect, sync mutation to Switchboard (produces global-scope ops)
      const mutationOnSwitchboard = waitForOperationsReady(
        switchboardEventBus,
        documentId,
      );
      const mutateJob = await connectReactor.execute(documentId, "main", [
        driveDocumentModelModule.actions.setDriveName({
          name: "Wedge Mutated",
        }),
      ]);
      await waitForJobCompletion(connectReactor, mutateJob.id);
      await mutationOnSwitchboard;

      // Record Switchboard's index count
      const indexBefore =
        await switchboardModule.operationIndex.get(documentId);
      const countBefore = indexBefore.results.length;
      expect(countBefore).toBeGreaterThan(0);

      // Get Switchboard's global-scope operations (already stored)
      const switchboardOps = await switchboardReactor.getOperations(
        documentId,
        { branch: "main" },
      );
      const globalOps = switchboardOps["global"]?.results ?? [];
      expect(globalOps.length).toBeGreaterThan(0);

      // Load exact duplicates into Switchboard via reactor.load().
      // All ops already exist, so executor dedup filters them all out.
      // Before the P0 fix, the load job would hang forever because
      // JOB_WRITE_READY was not emitted for empty operationsWithContext.
      const loadJob = await switchboardReactor.load(
        documentId,
        "main",
        globalOps,
      );
      await waitForJobCompletion(switchboardReactor, loadJob.id);

      // Verify the job reached READ_READY (not stuck at RUNNING)
      const jobStatus = await switchboardReactor.getJobStatus(loadJob.id);
      expect(jobStatus.status).toBe(JobStatus.READ_READY);

      // Verify no new index entries were created
      const indexAfter = await switchboardModule.operationIndex.get(documentId);
      expect(indexAfter.results.length).toBe(countBefore);
    }, 30000);

    it("executor-level dedup rejects duplicate operations via load", async () => {
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
        global: { name: "Dedup Test", icon: null, nodes: [] },
      });
      const documentId = document.header.id;

      // Unidirectional sync: Connect -> Switchboard
      await setupSyncForDrive(connectSyncManager, documentId, resolverBridge);

      const createOnSwitchboard = waitForOperationsReady(
        switchboardEventBus,
        documentId,
      );
      const createJob = await connectReactor.create(document);
      await waitForJobCompletion(connectReactor, createJob.id);
      await createOnSwitchboard;

      // Mutate on Connect, sync mutation to Switchboard
      const mutationOnSwitchboard = waitForOperationsReady(
        switchboardEventBus,
        documentId,
      );
      const mutateJob = await connectReactor.execute(documentId, "main", [
        driveDocumentModelModule.actions.setDriveName({ name: "Dedup" }),
      ]);
      await waitForJobCompletion(connectReactor, mutateJob.id);
      await mutationOnSwitchboard;

      // Verify ops are synced
      const switchboardOps = await switchboardReactor.getOperations(
        documentId,
        { branch: "main" },
      );
      const globalOps = switchboardOps["global"]?.results ?? [];
      expect(globalOps.length).toBeGreaterThan(0);

      // Record Switchboard's index count
      const indexBefore =
        await switchboardModule.operationIndex.get(documentId);
      const countBefore = indexBefore.results.length;
      expect(countBefore).toBeGreaterThan(0);

      // Load exact same operations again via reactor.load().
      // This exercises the executor's existingActionIds.has(op.action.id) dedup,
      // NOT cursor advancement (which only trims the outbox on subsequent polls).
      const loadJob = await switchboardReactor.load(
        documentId,
        "main",
        globalOps,
      );
      await waitForJobCompletion(switchboardReactor, loadJob.id);

      // Verify job completed
      const jobStatus = await switchboardReactor.getJobStatus(loadJob.id);
      expect(jobStatus.status).toBe(JobStatus.READ_READY);

      // Verify index count unchanged (executor dedup rejected all ops)
      const indexAfter = await switchboardModule.operationIndex.get(documentId);
      expect(indexAfter.results.length).toBe(countBefore);
    }, 30000);

    it("reshuffle operations converge and terminate", async () => {
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

      // Unidirectional sync first: Connect -> Switchboard
      await setupSyncForDrive(connectSyncManager, documentId, resolverBridge);

      // Create document on Connect, sync to Switchboard
      const createOnSwitchboard = waitForOperationsReady(
        switchboardEventBus,
        documentId,
      );
      const createJob = await connectReactor.create(document);
      await waitForJobCompletion(connectReactor, createJob.id);
      await createOnSwitchboard;

      // Remove sync to prevent polling from loading T1 as a trivial append
      // (preserving sourceRemote) before Connect creates T2.
      await connectSyncManager.remove(`switchboard-${documentId}`);

      // Mutate on Switchboard first (earlier timestamp T1)
      const switchboardMutateJob = await switchboardReactor.execute(
        documentId,
        "main",
        [
          driveDocumentModelModule.actions.setDriveName({
            name: "Switchboard Mutation",
          }),
        ],
      );
      await waitForJobCompletion(switchboardReactor, switchboardMutateJob.id);

      // Wait to ensure Connect's mutation gets a later timestamp T2
      await new Promise((r) => setTimeout(r, 10));

      // Mutate on Connect (later timestamp T2 > T1)
      const connectMutateJob = await connectReactor.execute(
        documentId,
        "main",
        [
          driveDocumentModelModule.actions.setDriveName({
            name: "Connect Mutation",
          }),
        ],
      );
      await waitForJobCompletion(connectReactor, connectMutateJob.id);

      // Get Switchboard's global-scope operations
      const switchboardOps = await switchboardReactor.getOperations(
        documentId,
        { branch: "main" },
      );
      const switchboardGlobalOps = switchboardOps["global"]?.results ?? [];

      // Load Switchboard's ops into Connect via reactor.load().
      // Switchboard's T1 mutation triggers getConflicting() which finds
      // Connect's T2 operation -> skipCount > 0 -> reshuffle deterministically.
      const loadJob = await connectReactor.load(
        documentId,
        "main",
        switchboardGlobalOps,
      );
      await waitForJobCompletion(connectReactor, loadJob.id);

      // After reshuffle, all Connect index entries should have sourceRemote=""
      // (reshuffle sets effectiveSourceRemote="" to broadcast to all remotes)
      const connectIndex = await connectModule.operationIndex.get(documentId);
      const connectEntries = connectIndex.results as OperationIndexEntry[];
      for (const entry of connectEntries) {
        expect(entry.sourceRemote).toBe("");
      }

      // Verify Connect's state reflects the reshuffle result
      const connectDoc = await connectReactor.get(documentId, {
        branch: "main",
      });
      expect(connectDoc.state).toBeDefined();

      // Re-establish Connect->Switchboard sync for bidirectional convergence test
      await setupSyncForDrive(connectSyncManager, documentId, resolverBridge);

      // Now set up bidirectional sync and verify echo termination
      await setupSyncForDriveOnSwitchboard(
        switchboardSyncManager,
        documentId,
        resolverBridge,
      );

      await waitForSyncStabilization(
        [connectEventBus, switchboardEventBus],
        1000,
        20000,
      );

      // States should converge
      const connectDocFinal = await connectReactor.get(documentId, {
        branch: "main",
      });
      const switchboardDocFinal = await switchboardReactor.get(documentId, {
        branch: "main",
      });
      expect(connectDocFinal.state).toEqual(switchboardDocFinal.state);

      // Verify operation counts stabilized (echo terminated)
      const connectCountAfterSync = (
        await connectModule.operationIndex.get(documentId)
      ).results.length;
      const switchboardCountAfterSync = (
        await switchboardModule.operationIndex.get(documentId)
      ).results.length;

      await new Promise((r) => setTimeout(r, 1000));

      const connectCountFinal = (
        await connectModule.operationIndex.get(documentId)
      ).results.length;
      const switchboardCountFinal = (
        await switchboardModule.operationIndex.get(documentId)
      ).results.length;
      expect(connectCountFinal).toBe(connectCountAfterSync);
      expect(switchboardCountFinal).toBe(switchboardCountAfterSync);
    }, 30000);
  });
});
