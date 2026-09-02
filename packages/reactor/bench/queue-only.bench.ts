import type { Options as BenchOptions } from "tinybench";
import { bench, describe } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import type { Job } from "../src/queue/types.js";
import { NullDocumentModelResolver } from "../src/registry/document-model-resolver.js";

/**
 * Every case measures a fresh InMemoryQueue constructed inside the measured
 * function, so no state survives an iteration and no case sees another
 * case's leftovers. The old module-level queue meant "enqueue job" pushed
 * into an ever-deeper array and left hundreds of thousands of jobs behind
 * for every case that ran after it.
 *
 * Job objects are built once per phase in prepare (deterministically, from
 * fixed seeds) and reused across iterations. That is safe because the
 * enqueue, dequeue and complete paths never mutate a Job; only failJob and
 * retryJob do, and no bench job fails or retries.
 *
 * Correctness assertions run once in prepare, on a dry run of the same
 * workload. The measured functions keep only cheap count guards, so a drain
 * that stalls or loses jobs fails the case instead of silently measuring
 * less work.
 */

/**
 * Shared across all cases: the bus never gains subscribers, and the resolver
 * is only consulted for CREATE_DOCUMENT actions, which no bench job carries.
 * Neither holds state that could leak between iterations or cases.
 */
const eventBus = new EventBus();
const resolver = new NullDocumentModelResolver();

function freshQueue(): InMemoryQueue {
  return new InMemoryQueue(eventBus, resolver);
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state * (1 / 2 ** 32);
  };
}

type JobSpec = {
  id: string;
  documentId: string;
  scope?: string;
  branch?: string;
  actionType?: string;
  payloadSize?: number;
  queueHint?: string[];
};

function makeJob(spec: JobSpec): Job {
  const scope = spec.scope ?? "default";
  return {
    id: spec.id,
    kind: "mutation",
    documentId: spec.documentId,
    scope,
    branch: spec.branch ?? "main",
    actions: [
      {
        id: `${spec.id}-action`,
        type: spec.actionType ?? "CREATE",
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
        input: { data: "x".repeat(spec.payloadSize ?? 8) },
        scope,
      },
    ],
    operations: [],
    maxRetries: 0,
    createdAt: "2023-01-01T00:00:00.000Z",
    queueHint: spec.queueHint ?? [],
    errorHistory: [],
    meta: { batchId: "test", batchJobIds: [spec.id] },
  };
}

/**
 * Declares a bench case with throws: true, so a failing task rethrows
 * instead of parking the error on result.error, dispatching no event, and
 * letting vitest report a passing suite with empty samples - which is
 * exactly how the old "queue hint dependency resolution" case shipped no
 * measurements at all.
 *
 * tinybench calls setup and teardown once around each of the warmup and run
 * loops, never per iteration, and vitest constructs the Task without
 * FnOptions, so beforeEach/afterEach are unreachable. Per-iteration
 * freshness therefore lives inside the measured function (a fresh queue),
 * and prepare only builds iteration-invariant fixtures.
 */
function benchCase<TState>(
  name: string,
  time: number,
  prepare: () => Promise<TState>,
  measure: (state: TState) => Promise<void>,
): void {
  let state: TState | undefined = undefined;

  const options: BenchOptions = {
    time,
    throws: true,
    setup: async () => {
      state = await prepare();
    },
    teardown: () => {
      state = undefined;
    },
  };

  bench(
    name,
    async () => {
      await measure(state!);
    },
    options,
  );
}

/** Drains via dequeueNext, completing each handle; returns dispatch order. */
async function drainCollect(queue: InMemoryQueue): Promise<Job[]> {
  const seen: Job[] = [];
  for (;;) {
    const handle = await queue.dequeueNext();
    if (!handle) {
      break;
    }
    seen.push(handle.job);
    handle.start();
    handle.complete();
  }
  return seen;
}

/** The same drain without collection, for the measured region. */
async function drainCount(queue: InMemoryQueue): Promise<number> {
  let count = 0;
  for (;;) {
    const handle = await queue.dequeueNext();
    if (!handle) {
      break;
    }
    count += 1;
    handle.start();
    handle.complete();
  }
  return count;
}

/** Drains one sub-queue via dequeue, completing each handle. */
async function drainByDocument(
  queue: InMemoryQueue,
  documentId: string,
  scope: string,
  branch: string,
): Promise<number> {
  let count = 0;
  for (;;) {
    const handle = await queue.dequeue(documentId, scope, branch);
    if (!handle) {
      break;
    }
    count += 1;
    handle.start();
    handle.complete();
  }
  return count;
}

/** Fails the case if a job dispatched before one of its dependencies. */
function assertTopologicalOrder(seen: Job[], expectedCount: number): void {
  if (seen.length !== expectedCount) {
    throw new Error(
      `bench fixture is wrong: expected ${expectedCount} jobs drained, got ${seen.length}`,
    );
  }
  const done = new Set<string>();
  for (const job of seen) {
    for (const dep of job.queueHint) {
      if (!done.has(dep)) {
        throw new Error(
          `bench fixture is wrong: ${job.id} dispatched before its dependency ${dep}`,
        );
      }
    }
    done.add(job.id);
  }
}

function buildMinimalJobs(prefix: string, count: number): Job[] {
  const jobs: Job[] = [];
  for (let i = 0; i < count; i++) {
    jobs.push(makeJob({ id: `${prefix}-${i}`, documentId: "doc1" }));
  }
  return jobs;
}

describe("Queue Only Operations", () => {
  benchCase(
    "enqueue job (100 per iteration, fresh queue)",
    1000,
    async () => {
      const jobs = buildMinimalJobs("enq", 100);

      const queue = freshQueue();
      for (const job of jobs) {
        await queue.enqueue(job);
      }
      if ((await queue.totalSize()) !== jobs.length) {
        throw new Error(
          "bench fixture is wrong: dry run did not enqueue all jobs",
        );
      }

      return { jobs };
    },
    async (state) => {
      const queue = freshQueue();
      for (const job of state.jobs) {
        await queue.enqueue(job);
      }

      const size = await queue.totalSize();
      if (size !== state.jobs.length) {
        throw new Error(
          `enqueue bench lost jobs: expected ${state.jobs.length}, got ${size}`,
        );
      }
    },
  );

  benchCase(
    "enqueue and dequeue (100 cycles per iteration, fresh queue)",
    1000,
    async () => {
      const jobs = buildMinimalJobs("cycle", 100);

      const queue = freshQueue();
      for (const job of jobs) {
        await queue.enqueue(job);
        const handle = await queue.dequeue(
          job.documentId,
          job.scope,
          job.branch,
        );
        if (handle?.job.id !== job.id) {
          throw new Error(
            `bench fixture is wrong: dequeued ${String(handle?.job.id)} after enqueueing ${job.id}`,
          );
        }
      }
      if (await queue.hasJobs()) {
        throw new Error("bench fixture is wrong: queue not empty after dry run");
      }

      return { jobs };
    },
    async (state) => {
      const queue = freshQueue();
      for (const job of state.jobs) {
        await queue.enqueue(job);
        await queue.dequeue(job.documentId, job.scope, job.branch);
      }

      if (await queue.hasJobs()) {
        throw new Error("enqueue/dequeue bench left jobs behind");
      }
    },
  );

  benchCase(
    "queue total size (500 jobs across 10 sub-queues)",
    1000,
    async () => {
      const queue = freshQueue();
      for (let i = 0; i < 500; i++) {
        await queue.enqueue(
          makeJob({ id: `size-${i}`, documentId: `doc-${i % 10}` }),
        );
      }
      if ((await queue.totalSize()) !== 500) {
        throw new Error("bench fixture is wrong: expected 500 queued jobs");
      }

      return { queue };
    },
    async (state) => {
      const size = await state.queue.totalSize();
      if (size !== 500) {
        throw new Error(`total size bench fixture drifted: got ${size}`);
      }
    },
  );
});

function buildDisparatePayloadJobs(): Job[] {
  const rand = makeRng(1337);
  const payloadOptions = [8, 64, 512, 4096];
  const jobs: Job[] = [];
  let n = 0;
  for (let d = 0; d < 12; d++) {
    for (let i = 0; i < 40; i++) {
      jobs.push(
        makeJob({
          id: `rapid-${n++}`,
          documentId: `doc-${d}`,
          branch: d % 2 ? "dev" : "main",
          payloadSize:
            payloadOptions[Math.floor(rand() * payloadOptions.length)],
        }),
      );
    }
  }
  return jobs;
}

function buildConflictingJobs(): Job[] {
  const ops = ["UPDATE", "DELETE", "CREATE"];
  const jobs: Job[] = [];
  for (let i = 0; i < 180; i++) {
    jobs.push(
      makeJob({
        id: `conflict-${i}`,
        documentId: "shared-doc",
        actionType: ops[i % ops.length],
        payloadSize: ((i % 16) + 1) * 10,
      }),
    );
  }
  return jobs;
}

function buildMixedPayloadJobs(): Job[] {
  const payloads = [8, 64, 256, 1024];
  const jobs: Job[] = [];
  for (let i = 0; i < 220; i++) {
    jobs.push(
      makeJob({
        id: `mixed-${i}`,
        documentId: `doc-${i % 6}`,
        branch: i % 2 === 0 ? "main" : "preview",
        payloadSize: payloads[i % payloads.length],
      }),
    );
  }
  return jobs;
}

describe("Queue Profiling Extensions", () => {
  benchCase(
    "rapid-fire enqueue across documents (disparate payloads)",
    1000,
    async () => {
      const jobs = buildDisparatePayloadJobs();

      const queue = freshQueue();
      for (const job of jobs) {
        await queue.enqueue(job);
      }
      if ((await queue.totalSize()) !== jobs.length) {
        throw new Error(
          "bench fixture is wrong: dry run did not enqueue all jobs",
        );
      }

      return { jobs };
    },
    async (state) => {
      const queue = freshQueue();
      for (const job of state.jobs) {
        await queue.enqueue(job);
      }

      const size = await queue.totalSize();
      if (size !== state.jobs.length) {
        throw new Error(
          `rapid-fire bench lost jobs: expected ${state.jobs.length}, got ${size}`,
        );
      }
    },
  );

  benchCase(
    "conflicting operations on same document",
    1000,
    async () => {
      const jobs = buildConflictingJobs();

      const queue = freshQueue();
      for (const job of jobs) {
        await queue.enqueue(job);
      }
      const drained = await drainByDocument(
        queue,
        "shared-doc",
        "default",
        "main",
      );
      if (drained !== jobs.length) {
        throw new Error(
          `bench fixture is wrong: drained ${drained} of ${jobs.length} jobs`,
        );
      }
      if (await queue.hasJobs()) {
        throw new Error("bench fixture is wrong: queue not empty after dry run");
      }

      return { jobs };
    },
    async (state) => {
      const queue = freshQueue();
      for (const job of state.jobs) {
        await queue.enqueue(job);
      }

      const drained = await drainByDocument(
        queue,
        "shared-doc",
        "default",
        "main",
      );
      if (drained !== state.jobs.length) {
        throw new Error(
          `conflicting-ops bench stalled: drained ${drained} of ${state.jobs.length}`,
        );
      }
    },
  );

  /**
   * The old case bounded the spread of per-document dequeue totals, but
   * those totals are fixed by construction (each document receives the same
   * share of jobs), so the check could not fail and asserted nothing about
   * scheduling. The dry run instead verifies the drain dispatches every job
   * exactly once with the constructed per-document distribution.
   */
  benchCase(
    "mixed payload sizes with dequeueNext",
    1000,
    async () => {
      const jobs = buildMixedPayloadJobs();

      const expected: Record<string, number> = {};
      for (const job of jobs) {
        expected[job.documentId] = (expected[job.documentId] || 0) + 1;
      }

      const queue = freshQueue();
      for (const job of jobs) {
        await queue.enqueue(job);
      }
      const seen = await drainCollect(queue);
      if (seen.length !== jobs.length) {
        throw new Error(
          `bench fixture is wrong: drained ${seen.length} of ${jobs.length} jobs`,
        );
      }
      const perDoc: Record<string, number> = {};
      for (const job of seen) {
        perDoc[job.documentId] = (perDoc[job.documentId] || 0) + 1;
      }
      for (const [documentId, count] of Object.entries(expected)) {
        if (perDoc[documentId] !== count) {
          throw new Error(
            `bench fixture is wrong: ${documentId} dispatched ${String(perDoc[documentId])} of ${count} jobs`,
          );
        }
      }
      if (await queue.hasJobs()) {
        throw new Error("bench fixture is wrong: queue not empty after dry run");
      }

      return { jobs };
    },
    async (state) => {
      const queue = freshQueue();
      for (const job of state.jobs) {
        await queue.enqueue(job);
      }

      const drained = await drainCount(queue);
      if (drained !== state.jobs.length) {
        throw new Error(
          `mixed-payload bench stalled: drained ${drained} of ${state.jobs.length}`,
        );
      }
    },
  );
});

/**
 * A linear dependency chain on one document, enqueued in topological order -
 * the shape executeBatch actually emits. The old case enqueued a dependent
 * ahead of its dependency on the same document; InMemoryQueue deliberately
 * holds a sub-queue behind a dep-blocked head (getNextJobWithMetDependencies
 * in src/queue/queue.ts, pinned by test/queue/unit.test.ts), so that shape
 * deadlocks by contract - and no producer can create it, because
 * executeBatch and loadBatch topologically sort a batch before enqueueing.
 * The deadlock failed an assertion during warmup, tinybench swallowed the
 * throw, and the case shipped zero samples.
 */
function buildDependencyChain(length: number): Job[] {
  const jobs: Job[] = [];
  for (let i = 0; i < length; i++) {
    jobs.push(
      makeJob({
        id: `chain-${i}`,
        documentId: "doc-dep",
        actionType: i === 0 ? "CREATE" : "UPDATE",
        payloadSize: 32,
        queueHint: i === 0 ? [] : [`chain-${i - 1}`],
      }),
    );
  }
  return jobs;
}

/** The ten-job DAG from the original case, with deterministic ids. */
function buildComplexDag(): Job[] {
  const rootA = makeJob({
    id: "dag-rootA",
    documentId: "dag-rootA-doc",
    payloadSize: 16,
  });
  const rootB = makeJob({
    id: "dag-rootB",
    documentId: "dag-rootB-doc",
    branch: "preview",
    payloadSize: 24,
  });
  const midA = makeJob({
    id: "dag-midA",
    documentId: "dag-midA-doc",
    queueHint: [rootA.id],
    actionType: "UPDATE",
    payloadSize: 64,
  });
  const midB = makeJob({
    id: "dag-midB",
    documentId: "dag-midB-doc",
    branch: "preview",
    queueHint: [rootB.id],
    actionType: "UPDATE",
    payloadSize: 96,
  });
  const childA = makeJob({
    id: "dag-childA",
    documentId: "dag-childA-doc",
    queueHint: [rootA.id],
    actionType: "UPDATE",
    payloadSize: 72,
  });
  const grandchildA = makeJob({
    id: "dag-grandchildA",
    documentId: "dag-grandchildA-doc",
    queueHint: [childA.id],
    actionType: "PATCH",
    payloadSize: 84,
  });
  const childB = makeJob({
    id: "dag-childB",
    documentId: "dag-childB-doc",
    branch: "preview",
    queueHint: [rootA.id],
    actionType: "UPDATE",
    payloadSize: 68,
  });
  const crossBranch = makeJob({
    id: "dag-crossBranch",
    documentId: "dag-crossBranch-doc",
    branch: "preview",
    queueHint: [childB.id, rootB.id],
    actionType: "PATCH",
    payloadSize: 92,
  });
  const join = makeJob({
    id: "dag-join",
    documentId: "dag-join-doc",
    queueHint: [midA.id, midB.id, grandchildA.id, crossBranch.id],
    actionType: "MERGE",
    payloadSize: 128,
  });
  const tail = makeJob({
    id: "dag-tail",
    documentId: "dag-tail-doc",
    queueHint: [join.id],
    actionType: "DELETE",
    payloadSize: 48,
  });

  return [
    tail,
    crossBranch,
    childB,
    grandchildA,
    childA,
    join,
    midB,
    midA,
    rootB,
    rootA,
  ];
}

/** The n-deep, m-wide DAG from the original case, built deterministically. */
function buildNestedDag(): Job[] {
  const depth = 40;
  const breadth = 8;
  const maxJobs = 800;
  let jobCount = 0;
  let idCounter = 0;
  const nextId = () => `dyn-${idCounter++}`;

  function buildNested(
    prefix: string,
    level: number,
    parentId?: string,
  ): { jobs: Job[]; leaves: string[] } {
    if (jobCount >= maxJobs) {
      return { jobs: [], leaves: parentId ? [parentId] : [] };
    }

    const current = makeJob({
      id: nextId(),
      documentId: prefix,
      queueHint: parentId ? [parentId] : [],
      actionType: level % 2 === 0 ? "UPDATE" : "PATCH",
      payloadSize: 32 + level * 12,
    });
    jobCount += 1;

    if (level === 0) {
      return { jobs: [current], leaves: [current.id] };
    }

    const jobs: Job[] = [current];
    const leaves: string[] = [];
    for (let i = 0; i < breadth; i++) {
      const childPrefix = `${prefix}/child-${level}-${i}`;
      const child = buildNested(childPrefix, level - 1, current.id);
      jobs.push(...child.jobs);
      leaves.push(...child.leaves);
    }

    return { jobs, leaves };
  }

  const { jobs, leaves } = buildNested("doc-dyn-root", depth);
  const join = makeJob({
    id: nextId(),
    documentId: "doc-dyn-join",
    queueHint: leaves,
    actionType: "MERGE",
    payloadSize: 200,
  });
  const tail = makeJob({
    id: nextId(),
    documentId: "doc-dyn-tail",
    queueHint: [join.id],
    actionType: "DELETE",
    payloadSize: 64,
  });

  return [tail, join, ...jobs.slice().reverse()];
}

describe("Queue Hint DAG Resolution", () => {
  benchCase(
    "queue hint dependency resolution",
    1000,
    async () => {
      const chain = buildDependencyChain(20);

      // Proves the dep gate specifically, isolated from per-document
      // serialization: the dependent lives on its own document, so the only
      // thing holding it back is its uncompleted dependency.
      const probeQueue = freshQueue();
      const root = makeJob({ id: "probe-root", documentId: "probe-doc-a" });
      const dependent = makeJob({
        id: "probe-dependent",
        documentId: "probe-doc-b",
        queueHint: [root.id],
        actionType: "UPDATE",
      });
      await probeQueue.enqueue(root);
      await probeQueue.enqueue(dependent);
      const first = await probeQueue.dequeueNext();
      if (first?.job.id !== root.id) {
        throw new Error(
          `bench fixture is wrong: expected ${root.id} first, got ${String(first?.job.id)}`,
        );
      }
      first.start();
      const gated = await probeQueue.dequeueNext();
      if (gated !== null) {
        throw new Error(
          "bench fixture is wrong: dependent dispatched before its dependency completed",
        );
      }
      first.complete();
      const second = await probeQueue.dequeueNext();
      if (second?.job.id !== dependent.id) {
        throw new Error(
          `bench fixture is wrong: expected ${dependent.id} second, got ${String(second?.job.id)}`,
        );
      }
      second.start();
      second.complete();

      const dryQueue = freshQueue();
      for (const job of chain) {
        await dryQueue.enqueue(job);
      }
      const seen = await drainCollect(dryQueue);
      assertTopologicalOrder(seen, chain.length);
      if (await dryQueue.hasJobs()) {
        throw new Error("bench fixture is wrong: queue not empty after dry run");
      }

      return { chain };
    },
    async (state) => {
      const queue = freshQueue();
      for (const job of state.chain) {
        await queue.enqueue(job);
      }

      const drained = await drainCount(queue);
      if (drained !== state.chain.length) {
        throw new Error(
          `dependency chain bench stalled: drained ${drained} of ${state.chain.length}`,
        );
      }
    },
  );

  /**
   * These two cases enqueue dependents before their dependencies, across
   * distinct sub-queues. Reactor producers never emit that order (batches
   * are topologically sorted), but the queue API pins it as valid: blocked
   * heads are skipped and released as their dependencies complete
   * (test/queue/unit.test.ts, "should skip dep-blocked heads"). The reverse
   * order keeps every scan walking blocked sub-queues first, which is the
   * resolution machinery these cases exist to stress.
   */
  benchCase(
    "queue hint complex DAG resolution",
    1000,
    async () => {
      const enqueueOrder = buildComplexDag();

      const queue = freshQueue();
      for (const job of enqueueOrder) {
        await queue.enqueue(job);
      }
      const seen = await drainCollect(queue);
      assertTopologicalOrder(seen, enqueueOrder.length);
      if (await queue.hasJobs()) {
        throw new Error("bench fixture is wrong: queue not empty after dry run");
      }

      return { enqueueOrder };
    },
    async (state) => {
      const queue = freshQueue();
      for (const job of state.enqueueOrder) {
        await queue.enqueue(job);
      }

      const drained = await drainCount(queue);
      if (drained !== state.enqueueOrder.length) {
        throw new Error(
          `complex DAG bench stalled: drained ${drained} of ${state.enqueueOrder.length}`,
        );
      }
    },
  );

  benchCase(
    "queue hint dynamic nested DAG resolution",
    3000,
    async () => {
      const enqueueOrder = buildNestedDag();

      const queue = freshQueue();
      for (const job of enqueueOrder) {
        await queue.enqueue(job);
      }
      const seen = await drainCollect(queue);
      assertTopologicalOrder(seen, enqueueOrder.length);
      if (await queue.hasJobs()) {
        throw new Error("bench fixture is wrong: queue not empty after dry run");
      }

      return { enqueueOrder };
    },
    async (state) => {
      const queue = freshQueue();
      for (const job of state.enqueueOrder) {
        await queue.enqueue(job);
      }

      const drained = await drainCount(queue);
      if (drained !== state.enqueueOrder.length) {
        throw new Error(
          `nested DAG bench stalled: drained ${drained} of ${state.enqueueOrder.length}`,
        );
      }
    },
  );
});
