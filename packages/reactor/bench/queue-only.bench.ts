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