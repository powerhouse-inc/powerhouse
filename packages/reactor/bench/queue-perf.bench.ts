import process from "node:process";
import { bench, describe, expect } from "vitest";
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
    jobCounter = 0;
    const { queue } = createQueue();
    const documents = 200;
    const jobsPerDoc = 200;
    const t0 = process.hrtime.bigint();

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

    const t1 = process.hrtime.bigint();
    if (process.env.PH_BENCH_VERBOSE) {
      const heap = process.memoryUsage().heapUsed;
      const ms = Number(t1 - t0) / 1e6;
      console.log(JSON.stringify({ bench: "bulk enqueue throughput", ms, heap }));
    }
  });

  bench("dequeueNext fairness under contention", async () => {
    // Drains mixed branches/documents to exercise round-robin and dependency checks.
    jobCounter = 0;
    const { queue } = createQueue();
    const documents = 80;
    const jobsPerDoc = 25;
    const seen: string[] = [];

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

    const t0 = process.hrtime.bigint();
    let steps = 0;
    const cap = 100_000;
    while (await queue.hasJobs()) {
      if (++steps > cap) throw new Error("Starvation: drain cap exceeded");
      const handle = await queue.dequeueNext();
      if (!handle) break;
      seen.push(handle.job.documentId);
      handle.start();
      handle.complete();
    }
    const t1 = process.hrtime.bigint();

    const perDocDequeue: Record<string, number> = {};
    for (const id of seen) {
      perDocDequeue[id] = (perDocDequeue[id] || 0) + 1;
    }
    const counts = Object.values(perDocDequeue);
    if (counts.length) {
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      const allowed = Math.max(10, Math.ceil(mean * 0.25));
      expect(max - min).toBeLessThanOrEqual(allowed);
    }
    expect(await queue.hasJobs()).toBe(false);
    if (process.env.PH_BENCH_VERBOSE) {
      const heap = process.memoryUsage().heapUsed;
      const ms = Number(t1 - t0) / 1e6;
      console.log(
        JSON.stringify({ bench: "dequeueNext fairness under contention", ms, heap }),
      );
    }
  });

  bench("dependency scan with long chains", async () => {
    // Forces linear dependency scans by enqueuing a long reverse-ordered chain.
    jobCounter = 0;
    const { queue } = createQueue();
    const chainLength = 600;
    let parentJobId: string | undefined;

    // Enqueue in reverse order so dependency checks scan the queue.
    for (let i = chainLength - 1; i >= 0; i--) {
      const job = createJob({
        documentId: "chain-doc",
        queueHint: parentJobId ? [parentJobId] : [],
        payloadSize: 12,
      });
      parentJobId = job.id;
      await queue.enqueue(
        job,
      );
    }

    const t0 = process.hrtime.bigint();
    const seen: Array<{ id: string; deps: string[] }> = [];
    let steps = 0;
    const cap = 2000;
    while (await queue.hasJobs()) {
      if (++steps > cap) throw new Error("Starvation: drain cap exceeded");
      const handle = await queue.dequeue("chain-doc", "default", "main");
      if (!handle) break;
      seen.push({ id: handle.job.id, deps: handle.job.queueHint ?? [] });
      handle.start();
      handle.complete();
    }
    const t1 = process.hrtime.bigint();

    const done = new Set<string>();
    for (const { id, deps } of seen) {
      expect(deps.every((dep) => done.has(dep))).toBe(true);
      done.add(id);
    }
    expect(await queue.hasJobs()).toBe(false);
    if (process.env.PH_BENCH_VERBOSE) {
      const heap = process.memoryUsage().heapUsed;
      const ms = Number(t1 - t0) / 1e6;
      console.log(JSON.stringify({ bench: "dependency scan with long chains", ms, heap }));
    }
  });

  bench("retry loop churn", async () => {
    // Hammers retryJob bookkeeping by retrying then completing a large batch.
    jobCounter = 0;
    const { queue } = createQueue();
    const totalJobs = 1200;

    for (let i = 0; i < totalJobs; i++) {
      const job = createJob({ documentId: `retry-doc-${i % 12}`, payloadSize: 16 });
      await queue.enqueue(job);
    }

    // First pass: dequeue and retry once to exercise retryJob bookkeeping.
    for (let i = 0; i < totalJobs; i++) {
      const handle = await queue.dequeueNext();
      if (!handle) break;
      handle.start();
      await queue.retryJob(handle.job.id, {
        message: "retrying",
        stack: "",
      });
    }

    expect(await queue.hasJobs()).toBe(true);

    // Second pass: drain and complete.
    const t0 = process.hrtime.bigint();
    let steps = 0;
    const cap = 5000;
    while (await queue.hasJobs()) {
      if (++steps > cap) throw new Error("Starvation: drain cap exceeded");
      const handle = await queue.dequeueNext();
      if (!handle) break;
      handle.start();
      handle.complete();
    }
    const t1 = process.hrtime.bigint();

    expect(await queue.hasJobs()).toBe(false);
    if (process.env.PH_BENCH_VERBOSE) {
      const heap = process.memoryUsage().heapUsed;
      const ms = Number(t1 - t0) / 1e6;
      console.log(JSON.stringify({ bench: "retry loop churn", ms, heap }));
    }
  });
});
