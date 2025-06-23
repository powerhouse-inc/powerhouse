import { bench, describe } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import { Job } from "../src/queue/types.js";

// Pre-create components to avoid setup overhead
const eventBus = new EventBus();
const queue = new InMemoryQueue(eventBus);

let jobCounter = 0;

function createMinimalJob(): Job {
  return {
    id: `job-${++jobCounter}`,
    documentId: "doc1",
    scope: "default",
    branch: "main",
    operation: {
      type: "CREATE",
      input: { data: "test" },
      index: 0,
      timestamp: "2023-01-01T00:00:00.000Z",
      hash: "hash-123",
      skip: 0,
    },
    maxRetries: 0,
    createdAt: "2023-01-01T00:00:00.000Z",
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
