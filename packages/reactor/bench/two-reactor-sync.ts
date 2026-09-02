/**
 * Two reactors syncing with each other, over four workloads.
 *
 * Run explicitly: `pnpm bench:sync`. This is not a vitest bench and not part of
 * the test suite; it drives tinybench directly and executes on import.
 *
 * Three things this harness gets wrong if you write it the obvious way, all of
 * which made it silently fail before:
 *
 * 1. A create has to land before anything writes to the document. Firing
 *    `void reactor.create(doc)` and then executing against the document races
 *    the create, and every write loses with DocumentNotFoundError. Creates now
 *    converge on both sides before the timed window opens.
 * 2. A collection is identified by the document that belongs to it. Syncing a
 *    fixed name like "collection1" registers remotes for a collection nothing
 *    is a member of: it connects, reports healthy, and transfers nothing. The
 *    ids are deterministic, so the remotes can be registered up front - which
 *    they have to be, because the outbox is filled from JOB_WRITE_READY as
 *    writes happen. A remote added afterwards never sees them, and pulling
 *    them later is the backfill this transport cannot do.
 * 3. Concurrent writes still have to be awaited somewhere. `void execute(...)`
 *    hides a rejection and leaves the bench waiting on convergence that can
 *    never happen, so the promises are collected and awaited together, and a
 *    JOB_FAILED on either side fails the wait at once.
 * 4. Both sides need the drive model registered. This one was invisible until
 *    the create above was awaited: the failure it produces is exactly the one
 *    the fire-and-forget call was swallowing.
 *
 * What it does not cover: a reactor joining late. Every scenario registers its
 * remotes before any write and has both sides writing live throughout, so
 * nothing here exercises catching up on history.
 *
 * That is a coverage gap rather than a transport limit. TestChannel's
 * triggerPull is a stub, so a reactor cannot pull, but SyncManager.add pushes
 * a backfill from the operation index (src/sync/sync-manager.ts:437), so a
 * remote added after the writes would in fact receive them. An earlier version
 * of this comment claimed the opposite, and that claim was load-bearing in a
 * wrong diagnosis of the convergence stall.
 *
 * What the number means: each case times from the first write to convergence.
 * Building the reactors, registering remotes and creating the documents happen
 * in tinybench's untimed beforeEach, and the state comparison that fails the
 * run on divergence happens in afterEach. The wait itself is event-driven: no
 * poll runs inside the window, and the only reads in it are one operation-log
 * summary per document per side once the events say every write has landed on
 * both sides. An earlier version connected, created, polled every 25ms and
 * verified inside the window, which was half to two thirds of every case.
 *
 * Alongside the timing, each case attributes its jobs from the lifecycle
 * events alone: queue wait (JOB_PENDING to JOB_RUNNING), apply (to
 * JOB_WRITE_READY) and index (to JOB_READ_READY), split into the writes this
 * harness submitted, loads from the peer, and loads that re-appended
 * operations the side had already written, which is what a reshuffle does.
 * Those land in the record's derived list. The Contention case exists for
 * this: it is Baseline with the writer alternating per operation and nothing
 * else changed, so the cost of two reactors writing one document can be read
 * against Baseline without the document count or action type moving too.
 */

import { readFileSync } from "node:fs";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { Bench } from "tinybench";
import type { DerivedRatio } from "./records/benchmark-schema.js";
import {
  buildMicroEntry,
  findTarget,
  suitesFromTinybench,
} from "./records/from-vitest.js";
import type { TinybenchTask } from "./records/from-vitest.js";
import {
  dirtyPaths,
  readMachineEnvironment,
} from "./records/machine-environment.js";
import { DriveCollectionId } from "../src/cache/operation-index-types.js";
import { ReactorBuilder } from "../src/core/reactor-builder.js";
import type { IReactor, ReactorModule } from "../src/core/types.js";
import { EventBus } from "../src/events/event-bus.js";
import type { IEventBus } from "../src/events/interfaces.js";
import { ReactorEventTypes } from "../src/events/types.js";
import type {
  JobFailedEvent,
  JobPendingEvent,
  JobReadReadyEvent,
  JobRunningEvent,
  JobWriteReadyEvent,
  Unsubscribe,
} from "../src/events/types.js";
import type { ISyncCursorStorage } from "../src/storage/interfaces.js";
import type { IChannelFactory } from "../src/sync/interfaces.js";
import { SyncBuilder } from "../src/sync/sync-builder.js";
import type { ChannelConfig, SyncEnvelope } from "../src/sync/types.js";
import { TestChannel } from "../test/sync/channels/test-channel.js";

type TwoReactorSetup = {
  reactorA: IReactor;
  reactorB: IReactor;
  moduleA: ReactorModule;
  moduleB: ReactorModule;
  channelRegistry: Map<string, TestChannel>;
  eventBusA: IEventBus;
  eventBusB: IEventBus;
  /** Remote name to its peer's, filled in per document by connectDocuments. */
  peerMapping: Map<string, string>;
  tracker: SyncTracker;
};

type JobStamp = {
  pending: number;
  running: number;
  writeReady: number;
  readReady: number;
  operations: number;
  reAppended: number;
};

type SideRecord = {
  /** Jobs this side submitted itself; every one must reach READ_READY. */
  tracked: Set<string>;
  /** Action ids indexed per job, local and loaded alike. */
  ready: Map<string, string[]>;
  seen: Set<string>;
  /** Action ids written on this side, for spotting a reshuffle's re-appends. */
  written: Set<string>;
  stamps: Map<string, JobStamp>;
  failure: Error | null;
};

/** Sums over one class of job; divide by jobs for the per-job mean. */
type JobBucket = {
  jobs: number;
  queueWaitMs: number;
  applyMs: number;
  indexMs: number;
  reAppendedOps: number;
};

/**
 * Where a case's jobs spent their time. A job this harness submitted is local;
 * any other is a load from the peer, split by whether it re-appended operations
 * this side had already written. Loads that wrote nothing, every incoming
 * operation already held, are counted apart. Per-job means, not wall time:
 * jobs on different documents overlap.
 */
type Attribution = {
  iterations: number;
  local: JobBucket;
  load: JobBucket;
  reshuffle: JobBucket;
  emptyLoads: number;
};

function emptyBucket(): JobBucket {
  return { jobs: 0, queueWaitMs: 0, applyMs: 0, indexMs: 0, reAppendedOps: 0 };
}

function emptyAttribution(): Attribution {
  return {
    iterations: 0,
    local: emptyBucket(),
    load: emptyBucket(),
    reshuffle: emptyBucket(),
    emptyLoads: 0,
  };
}

function addBucket(into: JobBucket, from: JobBucket): void {
  into.jobs += from.jobs;
  into.queueWaitMs += from.queueWaitMs;
  into.applyMs += from.applyMs;
  into.indexMs += from.indexMs;
  into.reAppendedOps += from.reAppendedOps;
}

function addAttribution(into: Attribution, from: Attribution): void {
  into.iterations += from.iterations;
  addBucket(into.local, from.local);
  addBucket(into.load, from.load);
  addBucket(into.reshuffle, from.reshuffle);
  into.emptyLoads += from.emptyLoads;
}

function stampFor(record: SideRecord, jobId: string): JobStamp {
  let stamp = record.stamps.get(jobId);
  if (stamp === undefined) {
    stamp = {
      pending: 0,
      running: 0,
      writeReady: 0,
      readReady: 0,
      operations: 0,
      reAppended: 0,
    };
    record.stamps.set(jobId, stamp);
  }
  return stamp;
}

/**
 * What each side has indexed, fed by JOB_READ_READY and JOB_FAILED. Waiting on
 * it costs no reads: the wait sleeps until an event arrives, and only reads the
 * operation logs once every tracked job's action ids have been indexed on both
 * sides. A reshuffle can still be in flight at that point, so a read that finds
 * disagreement waits for the next event rather than a timer.
 */
class SyncTracker {
  private readonly sides = new Map<IReactor, SideRecord>();
  private readonly unsubscribes: Unsubscribe[] = [];
  private version = 0;
  private wake: () => void = () => {};
  private timeout: Error | null = null;

  constructor(pairs: [IReactor, IEventBus][]) {
    for (const [reactor, eventBus] of pairs) {
      const record: SideRecord = {
        tracked: new Set(),
        ready: new Map(),
        seen: new Set(),
        written: new Set(),
        stamps: new Map(),
        failure: null,
      };
      this.sides.set(reactor, record);
      this.unsubscribes.push(
        eventBus.subscribe<JobPendingEvent>(
          ReactorEventTypes.JOB_PENDING,
          (_type, event) => {
            stampFor(record, event.jobId).pending = performance.now();
          },
        ),
        eventBus.subscribe<JobRunningEvent>(
          ReactorEventTypes.JOB_RUNNING,
          (_type, event) => {
            stampFor(record, event.jobId).running = performance.now();
          },
        ),
        eventBus.subscribe<JobWriteReadyEvent>(
          ReactorEventTypes.JOB_WRITE_READY,
          (_type, event) => {
            const stamp = stampFor(record, event.jobId);
            stamp.writeReady = performance.now();
            stamp.operations = event.operations.length;
            for (const entry of event.operations) {
              const id = entry.operation.action.id;
              if (record.written.has(id)) {
                stamp.reAppended += 1;
              } else {
                record.written.add(id);
              }
            }
          },
        ),
        eventBus.subscribe<JobReadReadyEvent>(
          ReactorEventTypes.JOB_READ_READY,
          (_type, event) => {
            stampFor(record, event.jobId).readReady = performance.now();
            const actionIds = event.operations.map(
              (entry) => entry.operation.action.id,
            );
            record.ready.set(event.jobId, actionIds);
            for (const id of actionIds) {
              record.seen.add(id);
            }
            this.bump();
          },
        ),
        eventBus.subscribe<JobFailedEvent>(
          ReactorEventTypes.JOB_FAILED,
          (_type, event) => {
            record.failure = event.error;
            this.bump();
          },
        ),
      );
    }
  }

  track(reactor: IReactor, jobId: string): void {
    const record = this.sides.get(reactor);
    if (!record) {
      throw new Error("Reactor is not one of the tracked sides");
    }
    record.tracked.add(jobId);
  }

  /** Forgets the stamps so far, so setup's jobs stay out of the attribution. */
  resetStamps(): void {
    for (const record of this.sides.values()) {
      record.stamps.clear();
    }
  }

  /** One iteration's attribution, from every job with all four stamps. */
  attribution(): Attribution {
    const result = emptyAttribution();
    result.iterations = 1;
    for (const record of this.sides.values()) {
      for (const [jobId, stamp] of record.stamps) {
        if (
          stamp.pending === 0 ||
          stamp.running === 0 ||
          stamp.writeReady === 0 ||
          stamp.readReady === 0
        ) {
          continue;
        }
        const local = record.tracked.has(jobId);
        if (!local && stamp.operations === 0) {
          result.emptyLoads += 1;
          continue;
        }
        const bucket = local
          ? result.local
          : stamp.reAppended > 0
            ? result.reshuffle
            : result.load;
        bucket.jobs += 1;
        bucket.queueWaitMs += stamp.running - stamp.pending;
        bucket.applyMs += stamp.writeReady - stamp.running;
        bucket.indexMs += stamp.readReady - stamp.writeReady;
        bucket.reAppendedOps += stamp.reAppended;
      }
    }
    return result;
  }

  /** Resolves once both sides hold every tracked write and agree on state. */
  async whenConverged(
    reactorA: IReactor,
    reactorB: IReactor,
    documentIds: string[],
    timeoutMs = 60_000,
  ): Promise<void> {
    this.timeout = null;
    const deadline = setTimeout(() => {
      this.timeout = new Error(`Sync did not complete within ${timeoutMs}ms`);
      this.bump();
    }, timeoutMs);
    try {
      for (;;) {
        this.throwIfFailed();
        const version = this.version;
        if (
          this.landedEverywhere() &&
          (await statesAgree(reactorA, reactorB, documentIds))
        ) {
          return;
        }
        if (this.version === version) {
          await this.nextEvent();
        }
      }
    } finally {
      clearTimeout(deadline);
    }
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes) {
      unsubscribe();
    }
  }

  private landedEverywhere(): boolean {
    const expected = new Set<string>();
    for (const record of this.sides.values()) {
      for (const jobId of record.tracked) {
        const actionIds = record.ready.get(jobId);
        if (actionIds === undefined) {
          return false;
        }
        for (const id of actionIds) {
          expected.add(id);
        }
      }
    }
    for (const record of this.sides.values()) {
      for (const id of expected) {
        if (!record.seen.has(id)) {
          return false;
        }
      }
    }
    return true;
  }

  private throwIfFailed(): void {
    if (this.timeout) {
      throw this.timeout;
    }
    for (const record of this.sides.values()) {
      if (record.failure) {
        throw record.failure;
      }
    }
  }

  private nextEvent(): Promise<void> {
    return new Promise((resolve) => {
      this.wake = resolve;
    });
  }

  private bump(): void {
    this.version += 1;
    const wake = this.wake;
    this.wake = () => {};
    wake();
  }
}

function deterministicId(prefix: string, counter: number): string {
  return `${prefix}-${counter.toString().padStart(8, "0")}`;
}

async function setupTwoReactors(): Promise<TwoReactorSetup> {
  const channelRegistry = new Map<string, TestChannel>();
  const peerMapping = new Map<string, string>();

  const createChannelFactory = (): IChannelFactory => {
    return {
      instance(
        remoteId: string,
        remoteName: string,
        config: ChannelConfig,
        cursorStorage: ISyncCursorStorage,
        _collectionId: DriveCollectionId,
        _filter: unknown,
        _operationIndex: unknown,
      ): TestChannel {
        const send = (envelope: SyncEnvelope): void => {
          const peerName = peerMapping.get(remoteName);
          const peerChannel = peerName
            ? channelRegistry.get(peerName)
            : undefined;
          if (!peerChannel) {
            throw new Error(
              `Peer channel '${peerName}' not found in registry for remote '${remoteName}'`,
            );
          }
          peerChannel.receive(envelope);
        };

        const channel = new TestChannel(
          remoteId,
          remoteName,
          cursorStorage,
          send,
        );

        channelRegistry.set(remoteName, channel);

        return channel;
      },
    };
  };

  const eventBusA = new EventBus();
  const eventBusB = new EventBus();

  // Both sides must hold the drive model, or every create fails on a model it
  // cannot load. The previous version never registered it and never noticed,
  // because it did not await the create that failed.
  const build = (eventBus: IEventBus) =>
    new ReactorBuilder()
      .withEventBus(eventBus)
      .withDocumentModelSources([driveDocumentModelModule as never])
      // --no-batch-applies is here because this harness is the only thing that
      // catches a batching change breaking convergence: two reactors writing
      // one document concurrently is the case the unit suite and the
      // integration suites do not produce.
      .withExecutorConfig({
        batchApplies: !process.argv.includes("--no-batch-applies"),
      })
      .withSync(new SyncBuilder().withChannelFactory(createChannelFactory()))
      .buildModule();

  const moduleA = await build(eventBusA);
  const moduleB = await build(eventBusB);
  const tracker = new SyncTracker([
    [moduleA.reactor, eventBusA],
    [moduleB.reactor, eventBusB],
  ]);

  return {
    reactorA: moduleA.reactor,
    reactorB: moduleB.reactor,
    moduleA,
    moduleB,
    channelRegistry,
    eventBusA,
    eventBusB,
    peerMapping,
    tracker,
  };
}

/** Submits one write; execute() resolves at enqueue, so the tracker follows it. */
async function submitWrite(
  setup: TwoReactorSetup,
  reactor: IReactor,
  docId: string,
  actions: Parameters<IReactor["execute"]>[2],
): Promise<void> {
  const info = await reactor.execute(docId, "main", actions);
  setup.tracker.track(reactor, info.id);
}

/** Creates documents on the chosen side; the caller waits for convergence. */
async function createDocuments(
  setup: TwoReactorSetup,
  ids: string[],
  sideFor: (setup: TwoReactorSetup, index: number) => IReactor,
): Promise<void> {
  for (const [index, id] of ids.entries()) {
    const document = driveDocumentModelModule.utils.createDocument();
    document.header.id = id;
    const reactor = sideFor(setup, index);
    const info = await reactor.create(document);
    setup.tracker.track(reactor, info.id);
  }
}

/** Registers a remote pair per document, which is what makes sync transfer. */
async function connectDocuments(
  setup: TwoReactorSetup,
  ids: string[],
): Promise<void> {
  const filter = { documentId: [], scope: [], branch: "main" };
  for (const id of ids) {
    const toB = `remoteB-${id}`;
    const toA = `remoteA-${id}`;
    setup.peerMapping.set(toB, toA);
    setup.peerMapping.set(toA, toB);

    const collectionId = DriveCollectionId.forDrive(id);
    await setup.moduleA.syncModule!.syncManager.add(
      toB,
      collectionId,
      { type: "internal", parameters: {} },
      filter,
    );
    await setup.moduleB.syncModule!.syncManager.add(
      toA,
      collectionId,
      { type: "internal", parameters: {} },
      filter,
    );
  }
}

type ScopeSummary = { actionIds: Set<string>; headHash: string };

/** Action-id set and head hash per scope, from the full unpaged log. */
async function summarizeScopes(
  reactor: IReactor,
  docId: string,
): Promise<Map<string, ScopeSummary>> {
  const result = await reactor.getOperations(docId, { branch: "main" });
  const summaries = new Map<string, ScopeSummary>();
  for (const [scope, page] of Object.entries(result)) {
    summaries.set(scope, {
      actionIds: new Set(page.results.map((op) => op.action.id)),
      headHash: page.results.at(-1)?.hash ?? "",
    });
  }
  return summaries;
}

/** Same action set and head (state) hash per scope; never compare op counts. */
function summariesConverged(
  a: Map<string, ScopeSummary>,
  b: Map<string, ScopeSummary>,
): boolean {
  if (a.size === 0 || a.size !== b.size) {
    return false;
  }
  for (const [scope, sideA] of a) {
    const sideB = b.get(scope);
    if (!sideB) {
      return false;
    }
    if (
      sideA.actionIds.size === 0 ||
      sideA.actionIds.size !== sideB.actionIds.size
    ) {
      return false;
    }
    for (const id of sideA.actionIds) {
      if (!sideB.actionIds.has(id)) {
        return false;
      }
    }
    if (sideA.headHash !== sideB.headHash) {
      return false;
    }
  }
  return true;
}

/** One log summary per document per side; the only reads in the timed window. */
async function statesAgree(
  reactorA: IReactor,
  reactorB: IReactor,
  documentIds: string[],
): Promise<boolean> {
  for (const docId of documentIds) {
    const summariesA = await summarizeScopes(reactorA, docId);
    const summariesB = await summarizeScopes(reactorB, docId);
    if (!summariesConverged(summariesA, summariesB)) {
      return false;
    }
  }
  return true;
}

/** Both sides must agree on every document's state; header revisions may not. */
async function assertConverged(
  reactorA: IReactor,
  reactorB: IReactor,
  documentIds: string[],
): Promise<void> {
  for (const docId of documentIds) {
    const docA = await reactorA.get(docId, { branch: "main" });
    const docB = await reactorB.get(docId, { branch: "main" });
    if (JSON.stringify(docA.state) !== JSON.stringify(docB.state)) {
      throw new Error(`Documents ${docId} not synced`);
    }
  }
}

const attributions = new Map<string, Attribution>();

function attributionFor(name: string): Attribution {
  let attribution = attributions.get(name);
  if (attribution === undefined) {
    attribution = emptyAttribution();
    attributions.set(name, attribution);
  }
  return attribution;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** The label before the colon; the case name carries the rest. */
function caseLabel(name: string): string {
  return name.split(":")[0];
}

function bucketRatios(
  label: string,
  kind: string,
  bucket: JobBucket,
  iterations: number,
): DerivedRatio[] {
  if (bucket.jobs === 0) {
    return [];
  }
  const note = `mean per job over ${bucket.jobs} ${kind} jobs in ${iterations} iterations`;
  return [
    {
      name: `${label}: ${kind} queue wait`,
      value: round(bucket.queueWaitMs / bucket.jobs),
      unit: "ms",
      note,
    },
    {
      name: `${label}: ${kind} apply`,
      value: round(bucket.applyMs / bucket.jobs),
      unit: "ms",
      note,
    },
    {
      name: `${label}: ${kind} index`,
      value: round(bucket.indexMs / bucket.jobs),
      unit: "ms",
      note,
    },
  ];
}

function derivedFrom(name: string, attribution: Attribution): DerivedRatio[] {
  const label = caseLabel(name);
  const iterations = attribution.iterations;
  return [
    ...bucketRatios(label, "local", attribution.local, iterations),
    ...bucketRatios(label, "load", attribution.load, iterations),
    ...bucketRatios(label, "reshuffle", attribution.reshuffle, iterations),
    {
      name: `${label}: reshuffles`,
      value: round(attribution.reshuffle.jobs / iterations),
      unit: "count",
      note: `load jobs per iteration that re-appended operations already written on that side; ${round(attribution.reshuffle.reAppendedOps / iterations)} operations re-appended per iteration`,
    },
    {
      name: `${label}: empty loads`,
      value: round(attribution.emptyLoads / iterations),
      unit: "count",
      note: "load jobs per iteration that wrote nothing, every incoming operation already held",
    },
  ];
}

function describeAttribution(attribution: Attribution): string {
  const per = (bucket: JobBucket) =>
    bucket.jobs === 0
      ? "none"
      : `${bucket.jobs} jobs, wait ${round(bucket.queueWaitMs / bucket.jobs)}ms, apply ${round(bucket.applyMs / bucket.jobs)}ms, index ${round(bucket.indexMs / bucket.jobs)}ms`;
  return [
    `local: ${per(attribution.local)}`,
    `load: ${per(attribution.load)}`,
    `reshuffle: ${per(attribution.reshuffle)}, ${attribution.reshuffle.reAppendedOps} ops re-appended`,
    `empty loads: ${attribution.emptyLoads}`,
  ].join("; ");
}

let setup: TwoReactorSetup | null = null;

type Scenario = {
  name: string;
  ids: string[];
  /** Which side creates each document. */
  creatorFor: (setup: TwoReactorSetup, index: number) => IReactor;
  /** Submits every write; the harness waits for convergence afterwards. */
  write: (setup: TwoReactorSetup, ids: string[]) => Promise<void>[];
};

type Lifecycle = {
  beforeEach: () => Promise<void>;
  afterEach: () => Promise<void>;
};

/**
 * Setup before the timed window, verification after it. tinybench 2.9.0 runs
 * both hooks outside the sample and still fails the task when afterEach throws.
 */
function lifecycleFor(scenario: Scenario): Lifecycle {
  return {
    beforeEach: async () => {
      setup = await setupTwoReactors();
      await connectDocuments(setup, scenario.ids);
      await createDocuments(setup, scenario.ids, scenario.creatorFor);
      await setup.tracker.whenConverged(
        setup.reactorA,
        setup.reactorB,
        scenario.ids,
      );
    },
    afterEach: async () => {
      const current = setup!;
      try {
        await assertConverged(current.reactorA, current.reactorB, scenario.ids);
        addAttribution(
          attributionFor(scenario.name),
          current.tracker.attribution(),
        );
      } finally {
        current.tracker.dispose();
        current.reactorA.kill();
        current.reactorB.kill();
      }
    },
  };
}

/** The timed window: submit the writes, then wait until both sides agree. */
async function run(scenario: Scenario): Promise<void> {
  const current = setup!;
  current.tracker.resetStamps();
  await Promise.all(scenario.write(current, scenario.ids));
  await current.tracker.whenConverged(
    current.reactorA,
    current.reactorB,
    scenario.ids,
  );
}

const alternating = (setup: TwoReactorSetup, index: number) =>
  index % 2 === 0 ? setup.reactorA : setup.reactorB;
const sideA = (setup: TwoReactorSetup) => setup.reactorA;

const scenarios: Scenario[] = [
  {
    name: "Baseline: 10 documents, 10 operations each (writes to convergence)",
    ids: Array.from({ length: 10 }, (_, i) => deterministicId("doc", i)),
    creatorFor: (setup, i) => (i < 5 ? setup.reactorA : setup.reactorB),
    write: (setup, ids) => {
      const writes: Promise<void>[] = [];
      for (const [i, docId] of ids.entries()) {
        const reactor = i < 5 ? setup.reactorA : setup.reactorB;
        for (let j = 0; j < 10; j++) {
          writes.push(
            submitWrite(setup, reactor, docId, [
              driveDocumentModelModule.actions.setDriveName({
                name: `Doc ${i} Update ${j}`,
              }),
            ]),
          );
        }
      }
      return writes;
    },
  },
  {
    name: "Contention: 10 documents, 10 operations each, writer alternates per operation (writes to convergence)",
    ids: Array.from({ length: 10 }, (_, i) => deterministicId("doc", i + 400)),
    creatorFor: (setup, i) => (i < 5 ? setup.reactorA : setup.reactorB),
    write: (setup, ids) => {
      const writes: Promise<void>[] = [];
      for (const [i, docId] of ids.entries()) {
        for (let j = 0; j < 10; j++) {
          const reactor = j % 2 === 0 ? setup.reactorA : setup.reactorB;
          writes.push(
            submitWrite(setup, reactor, docId, [
              driveDocumentModelModule.actions.setDriveName({
                name: `Contention ${i} Write ${j}`,
              }),
            ]),
          );
        }
      }
      return writes;
    },
  },
  {
    name: "Conflicts: 5 documents, 20 conflicting operations each (writes to convergence)",
    ids: Array.from({ length: 5 }, (_, i) => deterministicId("doc", i + 100)),
    creatorFor: sideA,
    write: (setup, ids) => {
      const writes: Promise<void>[] = [];
      for (const [i, docId] of ids.entries()) {
        for (let j = 0; j < 20; j++) {
          const reactor = j % 2 === 0 ? setup.reactorA : setup.reactorB;
          writes.push(
            submitWrite(setup, reactor, docId, [
              driveDocumentModelModule.actions.setDriveName({
                name: `Conflict ${i} Write ${j}`,
              }),
            ]),
          );
        }
      }
      return writes;
    },
  },
  {
    name: "Heavy Load: 50 documents, 100 operations each (writes to convergence)",
    ids: Array.from({ length: 50 }, (_, i) => deterministicId("doc", i + 200)),
    creatorFor: alternating,
    write: (setup, ids) => {
      const writes: Promise<void>[] = [];
      for (const [i, docId] of ids.entries()) {
        const reactor = alternating(setup, i);
        for (let j = 0; j < 100; j++) {
          writes.push(
            submitWrite(setup, reactor, docId, [
              driveDocumentModelModule.actions.setDriveName({
                name: `Heavy ${i} Update ${j}`,
              }),
            ]),
          );
        }
      }
      return writes;
    },
  },
  {
    name: "Deep Hierarchy: 10 documents with nested structures (writes to convergence)",
    ids: Array.from({ length: 10 }, (_, i) => deterministicId("doc", i + 300)),
    creatorFor: sideA,
    write: (setup, ids) => {
      const { reactorA, reactorB } = setup;
      const writes: Promise<void>[] = [];
      for (const [i, docId] of ids.entries()) {
        let parentFolder: string | null = null;
        for (let level = 0; level < 5; level++) {
          const folderId = deterministicId("folder", i * 100 + level);
          writes.push(
            submitWrite(setup, reactorA, docId, [
              driveDocumentModelModule.actions.addFolder({
                id: folderId,
                name: `Level ${level} Folder`,
                parentFolder,
              }),
            ]),
          );
          writes.push(
            submitWrite(setup, reactorB, docId, [
              driveDocumentModelModule.actions.addFile({
                id: deterministicId("file", i * 100 + level),
                name: `File at Level ${level}`,
                documentType: "powerhouse/document-model",
                parentFolder,
              }),
            ]),
          );
          parentFolder = folderId;
        }
      }
      return writes;
    },
  },
];

/**
 * A single pass of every scenario, for checking the harness still works.
 *
 * This exists because the harness silently rotted: it is not in the test suite
 * and no CI job runs it, so four separate defects accumulated with nothing to
 * catch them. `--smoke` runs each workload once and fails loudly, which is
 * cheap enough to run before trusting a number.
 */
async function smoke(): Promise<void> {
  let failures = 0;
  for (const scenario of scenarios) {
    const lifecycle = lifecycleFor(scenario);
    const started = Date.now();
    try {
      await lifecycle.beforeEach();
      const timedFrom = Date.now();
      await run(scenario);
      const timed = Date.now() - timedFrom;
      await lifecycle.afterEach();
      process.stdout.write(
        `PASS  ${scenario.name} (${(timed / 1000).toFixed(2)}s timed, ${((Date.now() - started) / 1000).toFixed(1)}s total)\n      ${describeAttribution(attributionFor(scenario.name))}\n`,
      );
    } catch (error) {
      failures += 1;
      process.stdout.write(
        `FAIL  ${scenario.name}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
  if (failures > 0) {
    process.stdout.write(
      `\n${failures} of ${scenarios.length} scenarios failed\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`\nall ${scenarios.length} scenarios passed\n`);
  process.exit(0);
}

if (process.argv.includes("--smoke")) {
  await smoke();
}

/**
 * `bench.table()` is unfit for a record: ops/sec is locale-formatted, the
 * margin is a string with a percent sign, and the average changes unit to
 * nanoseconds. `result` is the same TaskResult in the same milliseconds, so
 * --record reads that and leaves the table to the human path.
 */
const tinybenchVersion = (
  JSON.parse(readFileSync("node_modules/tinybench/package.json", "utf8")) as {
    version: string;
  }
).version;

const record = process.argv.includes("--record");

/**
 * Checked before the run rather than after it. These scenarios take minutes,
 * and a refusal is worth having in the first second rather than the six
 * hundredth.
 */
if (record && !process.argv.includes("--allow-dirty")) {
  const dirty = dirtyPaths(".", [
    "bench/BENCHMARKS.jsonl",
    "bench/TASKS.jsonl",
  ]);
  if (dirty.length > 0) {
    process.stderr.write(
      `The package has uncommitted changes, so the sha this record would carry describes code that did not run:\n${dirty.join("\n")}\nCommit, stash, or pass --allow-dirty and say so in a caveat.\n`,
    );
    process.exit(68);
  }
}
const say = (message: string): void => {
  if (record) {
    process.stderr.write(`${message}\n`);
    return;
  }
  process.stdout.write(`${message}\n`);
};

// throws: true so a scenario that fails during warmup fails the run. Without
// it tinybench parks the error on result.error, dispatches no event, and the
// bench reports a table with a missing row.
const bench = new Bench({ time: 10000, throws: true });
for (const scenario of scenarios) {
  bench.add(scenario.name, () => run(scenario), lifecycleFor(scenario));
}

say("Running Two-Reactor Sync Benchmarks...\n");

await bench.run();

if (record) {
  const target = findTarget("sync");
  const tasks: TinybenchTask[] = bench.tasks.map((task) => {
    if (task.result === undefined) {
      throw new Error(`${task.name} produced no result`);
    }
    if (task.result.error !== undefined) {
      const reason = task.result.error;
      throw new Error(
        `${task.name} failed: ${reason instanceof Error ? reason.message : JSON.stringify(reason)}`,
      );
    }
    return { name: task.name, ...task.result };
  });

  const entry = buildMicroEntry({
    target,
    runner: "tinybench",
    runnerVersion: tinybenchVersion,
    suites: suitesFromTinybench("two-reactor sync", tasks),
    environment: readMachineEnvironment(target.storage),
    recordedAt: new Date().toISOString(),
    conclusions: [],
    caveats: [],
    derived: scenarios.flatMap((scenario) =>
      derivedFrom(scenario.name, attributionFor(scenario.name)),
    ),
    title: "",
    question: "",
    tags: [],
    tasks: [],
  });

  process.stdout.write(`${JSON.stringify(entry)}\n`);
  process.exit(0);
}

console.log("\nResults:");
console.table(bench.table());
