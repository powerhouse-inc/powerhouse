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
  type ReactorModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "document-drive";
import type { DocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { createResolverBridge } from "./utils/gql-resolver-bridge.js";

type BridgeMode = "online" | "offline" | "rejecting";

/**
 * Creates a resolver bridge that can be toggled between online, offline,
 * and rejecting modes.
 * - online: normal passthrough to the resolver bridge
 * - offline: throws a network error (recoverable)
 * - rejecting: returns HTTP 200 with GraphQL errors array (unrecoverable)
 */
function createFailableResolverBridge(syncManagers: Map<string, ISyncManager>) {
  const innerBridge = createResolverBridge(syncManagers);
  let mode: BridgeMode = "online";

  const bridge: typeof fetch = async (input, init) => {
    if (mode === "offline") throw new Error("Network error: offline");
    if (mode === "rejecting") {
      return new Response(
        JSON.stringify({
          errors: [{ message: "Validation failed: invalid operation" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return innerBridge(input, init);
  };

  return {
    bridge,
    setOffline: (v: boolean) => {
      mode = v ? "offline" : "online";
    },
    setMode: (m: BridgeMode) => {
      mode = m;
    },
  };
}

type PushBackfillSetup = {
  connectReactor: IReactor;
  switchboardReactor: IReactor;
  connectModule: ReactorModule;
  switchboardModule: ReactorModule;
  connectEventBus: IEventBus;
  switchboardEventBus: IEventBus;
  connectSyncManager: ISyncManager;
  switchboardSyncManager: ISyncManager;
  bridge: typeof fetch;
  setOffline: (v: boolean) => void;
  setMode: (m: BridgeMode) => void;
};

async function setupPushBackfill(): Promise<PushBackfillSetup> {
  const syncManagerRegistry = new Map<string, ISyncManager>();
  const { bridge, setOffline, setMode } =
    createFailableResolverBridge(syncManagerRegistry);

  const logger = new ConsoleLogger(["test"]);

  const connectEventBus = new EventBus();
  const switchboardEventBus = new EventBus();

  const resolver = new NullDocumentModelResolver();
  const connectQueue = new InMemoryQueue(connectEventBus, resolver);
  const switchboardQueue = new InMemoryQueue(switchboardEventBus, resolver);

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
    bridge,
    setOffline,
    setMode,
  };
}

async function setupSyncForDrive(
  connectSyncManager: ISyncManager,
  driveId: string,
  fetchFn: typeof fetch,
): Promise<void> {
  const collectionId = driveCollectionId("main", driveId);

  await connectSyncManager.add(
    `switchboard-${driveId}`,
    collectionId,
    {
      type: "gql",
      parameters: {
        url: "http://switchboard/graphql",
        pollIntervalMs: 50,
        retryBaseDelayMs: 10,
        retryMaxDelayMs: 100,
        fetchFn,
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

describe("Push Backfill After Offline Recovery", () => {
  let connectReactor: IReactor;
  let switchboardReactor: IReactor;

  afterEach(() => {
    connectReactor.kill();
    switchboardReactor.kill();
  });

  it("should resend dead-lettered operations when channel recovers", async () => {
    const setup = await setupPushBackfill();
    connectReactor = setup.connectReactor;
    switchboardReactor = setup.switchboardReactor;
    const {
      connectModule,
      switchboardModule,
      connectEventBus,
      switchboardEventBus,
      connectSyncManager,
      bridge,
      setOffline,
    } = setup;

    // Step 1: Create document on Connect, sync to Switchboard
    const document = driveDocumentModelModule.utils.createDocument({
      global: {
        name: "Backfill Test",
        icon: null,
        nodes: [],
      },
    });
    const documentId = document.header.id;

    await setupSyncForDrive(connectSyncManager, documentId, bridge);

    const createOnSwitchboard = waitForOperationsReady(
      switchboardEventBus,
      documentId,
    );
    const createJob = await connectReactor.create(document);
    await waitForJobCompletion(connectReactor, createJob.id);
    await createOnSwitchboard;

    // Verify initial sync worked
    const connectDocInitial = await connectReactor.get(documentId, {
      branch: "main",
    });
    const switchboardDocInitial = await switchboardReactor.get(documentId, {
      branch: "main",
    });
    expect(connectDocInitial.state).toEqual(switchboardDocInitial.state);

    // Step 2: Go offline
    setOffline(true);

    // Step 3: Mutate while offline
    const mutateJob = await connectReactor.execute(documentId, "main", [
      driveDocumentModelModule.actions.setDriveName({
        name: "Offline Change",
      }),
    ]);
    await waitForJobCompletion(connectReactor, mutateJob.id);

    // Step 4: Wait for BufferedMailbox flush (~500ms) and async push failure
    // The push will fail because the bridge is offline, sending ops to deadLetter
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Verify the local state updated correctly
    const connectDocAfterMutation = await connectReactor.get(documentId, {
      branch: "main",
    });
    const connectState = connectDocAfterMutation.state as unknown as {
      global: { name: string };
    };
    expect(connectState.global.name).toBe("Offline Change");

    // Step 5: Come back online
    setOffline(false);

    // Step 6: Wait for sync to stabilize
    // With aggressive timers (pollIntervalMs: 50, retryBaseDelayMs: 10),
    // if backfill worked, the dead-lettered ops would be retried quickly.
    await waitForSyncStabilization(
      [connectEventBus, switchboardEventBus],
      1000,
      10000,
    );

    // Step 7: Assert that Switchboard received the offline mutation
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

    expect(switchboardOpsList.length).toBe(connectOpsList.length);

    const connectDoc = await connectReactor.get(documentId, {
      branch: "main",
    });
    const switchboardDoc = await switchboardReactor.get(documentId, {
      branch: "main",
    });

    expect(switchboardDoc.state).toEqual(connectDoc.state);
  }, 30000);

  it("should send unrecoverable push errors to deadLetter", async () => {
    const setup = await setupPushBackfill();
    connectReactor = setup.connectReactor;
    switchboardReactor = setup.switchboardReactor;
    const {
      connectEventBus,
      switchboardEventBus,
      connectSyncManager,
      bridge,
      setMode,
    } = setup;

    // Step 1: Create document on Connect, sync to Switchboard
    const document = driveDocumentModelModule.utils.createDocument({
      global: {
        name: "Unrecoverable Test",
        icon: null,
        nodes: [],
      },
    });
    const documentId = document.header.id;

    await setupSyncForDrive(connectSyncManager, documentId, bridge);

    const createOnSwitchboard = waitForOperationsReady(
      switchboardEventBus,
      documentId,
    );
    const createJob = await connectReactor.create(document);
    await waitForJobCompletion(connectReactor, createJob.id);
    await createOnSwitchboard;

    // Verify initial sync worked
    const connectDocInitial = await connectReactor.get(documentId, {
      branch: "main",
    });
    const switchboardDocInitial = await switchboardReactor.get(documentId, {
      branch: "main",
    });
    expect(connectDocInitial.state).toEqual(switchboardDocInitial.state);

    // Wait for Connect's poll to receive ackOrdinal and trim the outbox
    await waitForSyncStabilization(
      [connectEventBus, switchboardEventBus],
      500,
      5000,
    );

    // Step 2: Switch bridge to "rejecting" mode (GraphQL errors)
    setMode("rejecting");

    // Step 3: Mutate on Connect
    const mutateJob = await connectReactor.execute(documentId, "main", [
      driveDocumentModelModule.actions.setDriveName({
        name: "Rejected Change",
      }),
    ]);
    await waitForJobCompletion(connectReactor, mutateJob.id);

    // Step 4: Wait for BufferedMailbox flush and push failure propagation
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 5: Verify ops went to deadLetter (not retried)
    const remote = connectSyncManager.getByName(`switchboard-${documentId}`);
    const deadLetterItems = remote.channel.deadLetter.items;

    expect(deadLetterItems.length).toBeGreaterThan(0);

    // Switchboard should NOT have the rejected mutation
    const switchboardDoc = await switchboardReactor.get(documentId, {
      branch: "main",
    });
    const switchboardState = switchboardDoc.state as unknown as {
      global: { name: string };
    };
    expect(switchboardState.global.name).toBe("Unrecoverable Test");
  }, 30000);
});
