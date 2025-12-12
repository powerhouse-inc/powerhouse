import { bench, describe } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import type { Job } from "../src/queue/types.js";

// Pre-create components to avoid setup overhead
const eventBus = new EventBus();
const queue = new InMemoryQueue(eventBus);

let jobCounter = 0;
const rootSeed = 1337;
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}
const rand = makeRng(rootSeed);

function createMinimalJob(): Job {
  return {
    id: `job-${++jobCounter}`,
    kind: "mutation",
    documentId: "doc1",
    scope: "default",
    branch: "main",
    actions: [
      {
        id: `action-${jobCounter}`,
        type: "CREATE",
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
        input: { data: "test" },
        scope: "default",
      },
    ],
    operations: [],
    maxRetries: 0,
    createdAt: "2023-01-01T00:00:00.000Z",
    queueHint: [],
    errorHistory: [],
  };
}

describe("Queue Only Operations", () => {
  bench("enqueue job", async () => {
    const job = createMinimalJob();
    await queue.enqueue(job);
  });

  bench("enqueue and dequeue", async () => {
    const job = createMinimalJob();
    await queue.enqueue(job);
    await queue.dequeue(job.documentId, job.scope, job.branch);
  });

  bench("queue total size", async () => {
    await queue.totalSize();
  });
});

async function resetQueueState() {
  await queue.clearAll();
  jobCounter = 0;
}

function createJobVariant({
  documentId = "doc1",
  scope = "default",
  branch = "main",
  actionType = "CREATE",
  payloadSize = 8,
  queueHint = [],
}: {
  documentId?: string;
  scope?: string;
  branch?: string;
  actionType?: string;
  payloadSize?: number;
  queueHint?: string[];
}): Job {
  const jobId = `job-${++jobCounter}`;
  return {
    id: jobId,
    kind: "mutation",
    documentId,
    scope,
    branch,
    actions: [
      {
        id: `action-${jobCounter}`,
        type: actionType,
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
        input: { data: "x".repeat(payloadSize) },
        scope,
      },
    ],
    operations: [],
    maxRetries: 0,
    createdAt: "2023-01-01T00:00:00.000Z",
    queueHint,
    errorHistory: [],
  };
}

describe("Queue Profiling Extensions", () => {
  bench("rapid-fire enqueue across documents (disparate payloads)", async () => {
    // Stress enqueue throughput with many docs and varied payload sizes/branches.
    await resetQueueState();
    const documents = 12;
    const jobsPerDocument = 40;

    for (let d = 0; d < documents; d++) {
      const documentId = `doc-${d}`;
      const payloadOptions = [8, 64, 512, 4096];
      for (let i = 0; i < jobsPerDocument; i++) {
        const payloadSize = payloadOptions[Math.floor(rand() * payloadOptions.length)];
        await queue.enqueue(
          createJobVariant({ documentId, payloadSize, branch: d % 2 ? "dev" : "main" }),
        );
      }
    }
  });

  bench("conflicting operations on same document", async () => {
    // Serializes competing ops on a single doc to gauge contention/ordering.
    await resetQueueState();
    const documentId = "shared-doc";
    const ops = ["UPDATE", "DELETE", "CREATE"];

    for (let i = 0; i < 180; i++) {
      await queue.enqueue(
        createJobVariant({
          documentId,
          actionType: ops[i % ops.length],
          payloadSize: (i % 16 + 1) * 10,
        }),
      );
    }

    let handle: Awaited<ReturnType<typeof queue.dequeue>> | null;
    do {
      handle = await queue.dequeue(documentId, "default", "main");
      handle?.start();
      handle?.complete();
    } while (handle);
  });

  bench("mixed payload sizes with dequeueNext", async () => {
    // Mix sizes/branches and drain via dequeueNext to exercise fairness paths.
    await resetQueueState();
    const payloads = [8, 64, 256, 1024];

    for (let i = 0; i < 220; i++) {
      await queue.enqueue(
        createJobVariant({
          documentId: `doc-${i % 6}`,
          branch: i % 2 === 0 ? "main" : "preview",
          payloadSize: payloads[i % payloads.length],
        }),
      );
    }

    while (await queue.hasJobs()) {
      const handle = await queue.dequeueNext();
      if (!handle) break;
      handle.start();
      handle.complete();
    }
  });
});

describe("Queue Hint DAG Resolution", () => {
  bench("queue hint dependency resolution", async () => {
    // Ensures jobs gated by queueHint only run after their dependency completes.
    await resetQueueState();
    const root = createJobVariant({ documentId: "doc-dep" });
    const dependent = createJobVariant({
      documentId: "doc-dep",
      queueHint: [root.id],
      actionType: "UPDATE",
      payloadSize: 32,
    });

    await queue.enqueue(dependent);
    await queue.enqueue(root);

    const first = await queue.dequeueNext();
    first?.start();
    first?.complete();

    const second = await queue.dequeueNext();
    second?.start();
    second?.complete();
  });

  bench("queue hint complex DAG resolution", async () => {
    // Stress dependency resolution with a multi-branch DAG enqueued out of order.
    await resetQueueState();
    const dagId = `doc-dag-`;
    const rootDoc = `${dagId}-rootA`;
    const previewRootDoc = `${dagId}-rootB`;
    const rootA = createJobVariant({ documentId: rootDoc, payloadSize: 16 });
    const rootB = createJobVariant({
      documentId: previewRootDoc,
      branch: "preview",
      payloadSize: 24,
    });
    const midA = createJobVariant({
      documentId: `${rootDoc}-midA`,
      queueHint: [rootA.id],
      actionType: "UPDATE",
      payloadSize: 64,
    });
    const midB = createJobVariant({
      documentId: `${previewRootDoc}-midB`,
      branch: "preview",
      queueHint: [rootB.id],
      actionType: "UPDATE",
      payloadSize: 96,
    });
    const childA = createJobVariant({
      documentId: `${rootDoc}-childA`,
      queueHint: [rootA.id],
      actionType: "UPDATE",
      payloadSize: 72,
    });
    const grandchildA = createJobVariant({
      documentId: `${rootDoc}-childA-grandchild`,
      queueHint: [childA.id],
      actionType: "PATCH",
      payloadSize: 84,
    });
    const childB = createJobVariant({
      documentId: `${rootDoc}-childB`,
      branch: "preview",
      queueHint: [rootA.id],
      actionType: "UPDATE",
      payloadSize: 68,
    });
    const crossBranch = createJobVariant({
      documentId: `${previewRootDoc}-childB-grandchild`,
      branch: "preview",
      queueHint: [childB.id, rootB.id],
      actionType: "PATCH",
      payloadSize: 92,
    });
    const join = createJobVariant({
      documentId: `${dagId}-join`,
      queueHint: [midA.id, midB.id, grandchildA.id, crossBranch.id],
      actionType: "MERGE",
      payloadSize: 128,
    });
    const tail = createJobVariant({
      documentId: `${dagId}-tail`,
      queueHint: [join.id],
      actionType: "DELETE",
      payloadSize: 48,
    });

    await queue.enqueue(tail);
    await queue.enqueue(crossBranch);
    await queue.enqueue(childB);
    await queue.enqueue(grandchildA);
    await queue.enqueue(childA);
    await queue.enqueue(join);
    await queue.enqueue(midB);
    await queue.enqueue(midA);
    await queue.enqueue(rootB);
    await queue.enqueue(rootA);

    while (await queue.hasJobs()) {
      const handle = await queue.dequeueNext();
      if (!handle) break;
      handle.start();
      handle.complete();
    }
  });

  bench("queue hint dynamic nested DAG resolution", async () => {
    // Builds an n-deep, m-wide DAG of documents to stress dependency ordering.
    await resetQueueState();
    const depth = 40;
    const breadth = 8;
    const maxJobs = 800;
    let jobCount = 0;
    const dagPrefix = `doc-dyn-dag-`;

    function buildNested(
      prefix: string,
      level: number,
      parentId?: string,
    ): { jobs: Job[]; leaves: string[] } {
      if (jobCount >= maxJobs) {
        return { jobs: [], leaves: parentId ? [parentId] : [] };
      }

      const current = createJobVariant({
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

    const { jobs, leaves } = buildNested(`${dagPrefix}-root`, depth);
    const join = createJobVariant({
      documentId: `${dagPrefix}-join`,
      queueHint: leaves,
      actionType: "MERGE",
      payloadSize: 200,
    });
    const tail = createJobVariant({
      documentId: `${dagPrefix}-tail`,
      queueHint: [join.id],
      actionType: "DELETE",
      payloadSize: 64,
    });

    const enqueueOrder = [tail, join, ...jobs.slice().reverse()];
    for (const job of enqueueOrder) {
      await queue.enqueue(job);
    }

    while (await queue.hasJobs()) {
      const handle = await queue.dequeueNext();
      if (!handle) break;
      handle.start();
      handle.complete();
    }
  });
});
