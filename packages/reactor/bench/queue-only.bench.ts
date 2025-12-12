import { bench, describe } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import type { Job } from "../src/queue/types.js";

// Pre-create components to avoid setup overhead
const eventBus = new EventBus();
const queue = new InMemoryQueue(eventBus);

let jobCounter = 0;

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
        const payloadSize =
          payloadOptions[Math.floor(Math.random() * payloadOptions.length)];
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