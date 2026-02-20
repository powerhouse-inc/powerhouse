import {
  ConsoleLogger,
  EventBus,
  GqlRequestChannelFactory,
  GqlResponseChannelFactory,
  InMemoryQueue,
  JobStatus,
  NullDocumentModelResolver,
  ReactorBuilder,
  SyncBuilder,
  driveCollectionId,
  type IReactor,
  type ISyncManager,
  type ReactorModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "document-drive";
import type { Action, DocumentModelModule, PHDocument } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createResolverBridge } from "./utils/gql-resolver-bridge.js";

type Setup = {
  connectA: ReactorModule;
  connectB: ReactorModule;
  switchboard: ReactorModule;
  bridge: typeof fetch;
};

const DOCUMENT_ID = "3af9b9e2-4b3f-45d4-87b3-5d345b1fb398";
const FIXED_TIMESTAMP = "2026-02-17T16:17:13.886Z";
const WAIT_STEP_MS = 50;

type GlobalEntry = {
  index: number;
  skip: number;
  action: { id: string; type: string };
  id: string;
  timestampUtcMs: string;
};

function createConnectModule(
  logger: ConsoleLogger,
  eventBus: EventBus,
  queue: InMemoryQueue,
): Promise<ReactorModule> {
  return new ReactorBuilder()
    .withEventBus(eventBus)
    .withQueue(queue)
    .withDocumentModels([
      driveDocumentModelModule as unknown as DocumentModelModule,
    ])
    .withSync(
      new SyncBuilder().withChannelFactory(
        new GqlRequestChannelFactory(logger, undefined, queue),
      ),
    )
    .buildModule();
}

function createSwitchboardModule(
  logger: ConsoleLogger,
  eventBus: EventBus,
  queue: InMemoryQueue,
): Promise<ReactorModule> {
  return new ReactorBuilder()
    .withEventBus(eventBus)
    .withQueue(queue)
    .withDocumentModels([
      driveDocumentModelModule as unknown as DocumentModelModule,
    ])
    .withSync(
      new SyncBuilder().withChannelFactory(
        new GqlResponseChannelFactory(logger),
      ),
    )
    .buildModule();
}

async function setup(): Promise<Setup> {
  const logger = new ConsoleLogger(["test"]);

  const eventA = new EventBus();
  const eventB = new EventBus();
  const eventS = new EventBus();

  const resolver = new NullDocumentModelResolver();
  const queueA = new InMemoryQueue(eventA, resolver);
  const queueB = new InMemoryQueue(eventB, resolver);
  const queueS = new InMemoryQueue(eventS, resolver);

  const connectA = await createConnectModule(logger, eventA, queueA);
  const connectB = await createConnectModule(logger, eventB, queueB);
  const switchboard = await createSwitchboardModule(logger, eventS, queueS);

  const syncManagerRegistry = new Map<string, ISyncManager>();
  syncManagerRegistry.set("switchboard", switchboard.syncModule!.syncManager);

  const bridge = createResolverBridge(syncManagerRegistry, { log: false });

  return { connectA, connectB, switchboard, bridge };
}

async function advanceAndFlush(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await Promise.resolve();
}

async function waitForJobCompletion(
  reactor: IReactor,
  jobId: string,
  timeoutMs = 20000,
): Promise<void> {
  let elapsedMs = 0;

  while (elapsedMs <= timeoutMs) {
    const status = await reactor.getJobStatus(jobId);

    if (status.status === JobStatus.READ_READY) {
      return;
    }

    if (status.status === JobStatus.FAILED) {
      throw new Error(
        `Job ${jobId} failed: ${status.error?.message ?? "unknown"}`,
      );
    }

    await advanceAndFlush(WAIT_STEP_MS);
    elapsedMs += WAIT_STEP_MS;
  }

  throw new Error(`Timed out waiting for job ${jobId}`);
}

async function waitForDocumentAvailable(
  reactor: IReactor,
  documentId: string,
  timeoutMs = 20000,
): Promise<void> {
  let elapsedMs = 0;

  while (elapsedMs <= timeoutMs) {
    try {
      await reactor.get(documentId, { branch: "main" });
      return;
    } catch {
      // Keep polling until available.
    }

    await advanceAndFlush(WAIT_STEP_MS);
    elapsedMs += WAIT_STEP_MS;
  }

  throw new Error(`Timed out waiting for document ${documentId}`);
}

function createDeterministicAddFolderAction(
  actionId: string,
  folderId: string,
): Action {
  const action = driveDocumentModelModule.actions.addFolder({
    id: folderId,
    name: "same",
    parentFolder: null,
  });

  action.id = actionId;
  action.timestampUtcMs = FIXED_TIMESTAMP;

  return action;
}

function gcGlobalEntries(entries: GlobalEntry[]): GlobalEntry[] {
  const sorted = entries.slice().sort((a, b) => a.index - b.index);

  return sorted.filter((entry) => {
    for (const later of sorted) {
      if (later.index <= entry.index || later.skip <= 0) {
        continue;
      }

      const logicalIndex = later.index - later.skip;
      if (logicalIndex <= entry.index) {
        return false;
      }
    }

    return true;
  });
}

function normalizeForComparison(entries: GlobalEntry[]) {
  return entries.map((entry) => ({
    actionId: entry.action.id,
    actionType: entry.action.type,
    operationId: entry.id,
    timestampUtcMs: entry.timestampUtcMs,
  }));
}

describe("Connect-Switchboard reshuffle rebroadcast convergence", () => {
  let connectA: ReactorModule;
  let connectB: ReactorModule;
  let switchboard: ReactorModule;

  afterEach(() => {
    connectA?.reactor.kill();
    connectB?.reactor.kill();
    switchboard?.reactor.kill();

    vi.useRealTimers();
  });

  it("should converge after reshuffle rebroadcast between two connect reactors", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_TIMESTAMP));

    const setupResult = await setup();
    connectA = setupResult.connectA;
    connectB = setupResult.connectB;
    switchboard = setupResult.switchboard;

    const collectionId = driveCollectionId("main", DOCUMENT_ID);

    await connectA.syncModule!.syncManager.add(
      `switchboard-a-${DOCUMENT_ID}`,
      collectionId,
      {
        type: "gql",
        parameters: {
          url: "http://switchboard/graphql",
          pollIntervalMs: 25,
          retryBaseDelayMs: 10,
          retryMaxDelayMs: 200,
          fetchFn: setupResult.bridge,
        },
      },
      { documentId: [], scope: [], branch: "main" },
    );

    await connectB.syncModule!.syncManager.add(
      `switchboard-b-${DOCUMENT_ID}`,
      collectionId,
      {
        type: "gql",
        parameters: {
          url: "http://switchboard/graphql",
          pollIntervalMs: 25,
          retryBaseDelayMs: 10,
          retryMaxDelayMs: 200,
          fetchFn: setupResult.bridge,
        },
      },
      { documentId: [], scope: [], branch: "main" },
    );

    const document = driveDocumentModelModule.utils.createDocument({
      global: { name: "Repro", icon: null, nodes: [] },
    });
    document.header.id = DOCUMENT_ID;

    const createJob = await connectA.reactor.create(document);
    await waitForJobCompletion(connectA.reactor, createJob.id);

    await Promise.all([
      waitForDocumentAvailable(switchboard.reactor, DOCUMENT_ID),
      waitForDocumentAvailable(connectB.reactor, DOCUMENT_ID),
    ]);

    const actionA = createDeterministicAddFolderAction("action-A", "folder-A");
    const actionB = createDeterministicAddFolderAction("action-B", "folder-B");

    const [jobA, jobB] = await Promise.all([
      connectA.reactor.execute(DOCUMENT_ID, "main", [actionA]),
      connectB.reactor.execute(DOCUMENT_ID, "main", [actionB]),
    ]);

    await waitForJobCompletion(connectA.reactor, jobA.id);
    await waitForJobCompletion(connectB.reactor, jobB.id);

    await advanceAndFlush(3000);

    const [docA, docB, docS] = await Promise.all([
      connectA.reactor.get(DOCUMENT_ID, { branch: "main" }),
      connectB.reactor.get(DOCUMENT_ID, { branch: "main" }),
      switchboard.reactor.get(DOCUMENT_ID, { branch: "main" }),
    ]);

    const [indexA, indexB, indexS] = await Promise.all([
      connectA.operationIndex.get(DOCUMENT_ID),
      connectB.operationIndex.get(DOCUMENT_ID),
      switchboard.operationIndex.get(DOCUMENT_ID),
    ]);

    const globalEntries = [
      ...indexA.results,
      ...indexB.results,
      ...indexS.results,
    ].filter((entry) => entry.scope === "global");

    expect(globalEntries.length).toBeGreaterThan(0);
    expect(globalEntries.some((entry) => entry.skip > 0)).toBe(true);

    const globalA = indexA.results.filter(
      (entry) => entry.scope === "global",
    ) as unknown as GlobalEntry[];
    const globalB = indexB.results.filter(
      (entry) => entry.scope === "global",
    ) as unknown as GlobalEntry[];
    const globalS = indexS.results.filter(
      (entry) => entry.scope === "global",
    ) as unknown as GlobalEntry[];

    const gcA = normalizeForComparison(gcGlobalEntries(globalA));
    const gcB = normalizeForComparison(gcGlobalEntries(globalB));
    const gcS = normalizeForComparison(gcGlobalEntries(globalS));

    expect(gcA).toEqual(gcB);
    expect(gcB).toEqual(gcS);

    const stateA = (docA as PHDocument).state;
    const stateB = (docB as PHDocument).state;
    const stateS = (docS as PHDocument).state;

    expect(stateA).toEqual(stateB);
    expect(stateB).toEqual(stateS);
  }, 20000);
});
