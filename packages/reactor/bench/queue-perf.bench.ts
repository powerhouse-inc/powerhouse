import { bench, describe } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import type { Job } from "../src/queue/types.js";

let jobCounter = 0;

function createJob({
  documentId,
  branch = "main",
  scope = "default",
  queueHint = [],
  payloadSize = 32,
}: {
  documentId: string;
  branch?: string;
  scope?: string;
  queueHint?: string[];
  payloadSize?: number;
}): Job {
  const id = `job-perf-${++jobCounter}`;
  return {
    id,
    kind: "mutation",
    documentId,
    branch,
    scope,
    queueHint,
    actions: [
      {
        id: `action-${jobCounter}`,
        type: "UPDATE",
        timestampUtcMs: "2020-01-01T00:00:00.000Z",
        input: { data: "x".repeat(payloadSize) },
        scope,
      },
    ],
    operations: [],
    maxRetries: 0,
    createdAt: "2020-01-01T00:00:00.000Z",
    errorHistory: [],
  };
}

function createQueue() {
  const eventBus = new EventBus();
  const queue = new InMemoryQueue(eventBus);
  return { queue };
}

describe("InMemoryQueue hot-path performance", () => {
  bench("bulk enqueue throughput", async () => {
    // Saturates enqueue path with many docs/branches to measure raw write throughput.
    const { queue } = createQueue();
    const documents = 200;
    const jobsPerDoc = 200;

    for (let d = 0; d < documents; d++) {
      for (let j = 0; j < jobsPerDoc; j++) {
        await queue.enqueue(
          createJob({
            documentId: `doc-${d}`,
            branch: d % 2 === 0 ? "main" : "preview",
            payloadSize: 8 + (j % 8) * 8,
          }),
        );
      }
    }
  });

  bench("dequeueNext fairness under contention", async () => {
    // Drains mixed branches/documents to exercise round-robin and dependency checks.
    const { queue } = createQueue();
    const documents = 80;
    const jobsPerDoc = 25;

    for (let d = 0; d < documents; d++) {
      for (let j = 0; j < jobsPerDoc; j++) {
        await queue.enqueue(
          createJob({
            documentId: `doc-${d}`,
            branch: j % 3 === 0 ? "preview" : "main",
            payloadSize: 24,
          }),
        );
      }
    }

    while (await queue.hasJobs()) {
      const handle = await queue.dequeueNext();
      if (!handle) break;
      handle.start();
      handle.complete();
    }
  });

  bench("dependency scan with long chains", async () => {
    // Forces linear dependency scans by enqueuing a long reverse-ordered chain.
    const { queue } = createQueue();
    const chainLength = 600;
    const ids: string[] = [];
    for (let i = 0; i < chainLength; i++) {
      const id = `dep-${i}`;
      ids.push(id);
    }

    // Enqueue in reverse order so dependency checks scan the queue.
    for (let i = chainLength - 1; i >= 0; i--) {
      const parent = i === chainLength - 1 ? [] : [ids[i + 1]];
      await queue.enqueue(
        createJob({
          documentId: "chain-doc",
          queueHint: parent,
          payloadSize: 12,
        }),
      );
    }

    while (await queue.hasJobs()) {
      const handle = await queue.dequeue("chain-doc", "default", "main");
      if (!handle) break;
      handle.start();
      handle.complete();
    }
  });

  bench("retry loop churn", async () => {
    // Hammers retryJob bookkeeping by retrying then completing a large batch.
    const { queue } = createQueue();
    const jobIds: string[] = [];
    const totalJobs = 1200;

    for (let i = 0; i < totalJobs; i++) {
      const job = createJob({ documentId: `retry-doc-${i % 12}`, payloadSize: 16 });
      jobIds.push(job.id);
      await queue.enqueue(job);
    }

    // First pass: dequeue and retry once to exercise retryJob bookkeeping.
    for (let i = 0; i < jobIds.length; i++) {
      const handle = await queue.dequeueNext();
      if (!handle) break;
      handle.start();
      await queue.retryJob(handle.job.id, {
        message: "retrying",
        stack: "",
      });
    }

    // Second pass: drain and complete.
    while (await queue.hasJobs()) {
      const handle = await queue.dequeueNext();
      if (!handle) break;
      handle.start();
      handle.complete();
    }
  });
});
