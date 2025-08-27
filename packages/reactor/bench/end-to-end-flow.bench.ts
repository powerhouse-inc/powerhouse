import { afterEach, beforeEach, bench, describe } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { InMemoryJobExecutor } from "../src/executor/job-executor.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import { Job } from "../src/queue/types.js";

// Test data generators
function createSimpleJob(
  id: string,
  documentId = "doc1",
  scope = "default",
  branch = "main",
): Job {
  return {
    id,
    documentId,
    scope,
    branch,
    operation: {
      action: {
        id: `action-${id}`,
        type: "CREATE",
        timestampUtcMs: new Date().toISOString(),
        input: { data: `simple data ${id}` },
        scope: scope,
      },
      index: 0,
      timestampUtcMs: new Date().toISOString(),
      hash: `hash-${Date.now()}`,
      skip: 0,
    },
    maxRetries: 0,
    createdAt: new Date().toISOString(),
  };
}

function createComplexJob(
  id: string,
  documentId = "doc1",
  scope = "default",
  branch = "main",
): Job {
  return {
    id,
    documentId,
    scope,
    branch,
    operation: {
      action: {
        id: `action-${id}`,
        type: "UPDATE",
        timestampUtcMs: new Date().toISOString(),
        input: {
          data: Array.from({ length: 100 }, (_, i) => `complex data item ${i}`),
          metadata: {
            timestampUtcMs: Date.now(),
            user: "test-user",
            version: "1.0.0",
          },
        },
        scope: scope,
      },
      index: Math.floor(Math.random() * 1000),
      timestampUtcMs: new Date().toISOString(),
      hash: `hash-${Date.now()}`,
      skip: 0,
    },
    maxRetries: 0,
    createdAt: new Date().toISOString(),
  };
}

describe("Queue Performance", () => {
  let eventBus: EventBus;
  let queue: InMemoryQueue;

  beforeEach(() => {
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);
  });

  afterEach(async () => {
    await queue.clearAll();
  });

  bench("enqueue simple job", async () => {
    const job = createSimpleJob(`job-${Math.random()}`);
    await queue.enqueue(job);
  });

  bench("enqueue complex job", async () => {
    const job = createComplexJob(`job-${Math.random()}`);
    await queue.enqueue(job);
  });

  bench("enqueue and dequeue simple job", async () => {
    const job = createSimpleJob(`job-${Math.random()}`);
    await queue.enqueue(job);
    await queue.dequeue(job.documentId, job.scope, job.branch);
  });

  bench("enqueue and dequeue complex job", async () => {
    const job = createComplexJob(`job-${Math.random()}`);
    await queue.enqueue(job);
    await queue.dequeue(job.documentId, job.scope, job.branch);
  });
});

describe("Queue Operations with Pre-filled Data", () => {
  let eventBus: EventBus;
  let queue: InMemoryQueue;
  let prefilledJobs: Job[];

  beforeEach(async () => {
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);

    // Pre-fill queue with jobs for realistic testing
    prefilledJobs = Array.from({ length: 100 }, (_, i) =>
      createSimpleJob(`prefill-${i}`),
    );
    for (const job of prefilledJobs) {
      await queue.enqueue(job);
    }
  });

  afterEach(async () => {
    await queue.clearAll();
  });

  bench("enqueue to populated queue", async () => {
    const job = createSimpleJob(`new-${Math.random()}`);
    await queue.enqueue(job);
  });

  bench("dequeue from populated queue", async () => {
    await queue.dequeueNext();
  });

  bench("remove specific job from populated queue", async () => {
    const randomJob =
      prefilledJobs[Math.floor(Math.random() * prefilledJobs.length)];
    await queue.remove(randomJob.id);
  });

  bench("get queue size", async () => {
    await queue.totalSize();
  });
});

describe("Job Executor Performance", () => {
  let eventBus: EventBus;
  let queue: InMemoryQueue;
  let executor: InMemoryJobExecutor;

  beforeEach(async () => {
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);
    executor = new InMemoryJobExecutor(eventBus, queue);
    await executor.start({ maxConcurrency: 1, jobTimeout: 5000 });
  });

  afterEach(async () => {
    await executor.stop(false);
    await queue.clearAll();
  });

  bench("execute single simple job", async () => {
    const job = createSimpleJob(`exec-${Math.random()}`);
    await executor.executeJob(job);
  });

  bench("execute single complex job", async () => {
    const job = createComplexJob(`exec-${Math.random()}`);
    await executor.executeJob(job);
  });

  bench("get executor status", async () => {
    await executor.getStatus();
  });

  bench("get executor stats", async () => {
    await executor.getStats();
  });
});

describe("Event Bus with Queue Integration", () => {
  let eventBus: EventBus;
  let queue: InMemoryQueue;

  beforeEach(() => {
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);
  });

  afterEach(async () => {
    await queue.clearAll();
  });

  bench("enqueue with event emission", async () => {
    const job = createSimpleJob(`event-${Math.random()}`);
    await queue.enqueue(job); // This triggers event emission
  });

  bench("multiple enqueues with events", async () => {
    const jobs = Array.from({ length: 5 }, (_, i) =>
      createSimpleJob(`batch-${i}-${Math.random()}`),
    );
    for (const job of jobs) {
      await queue.enqueue(job);
    }
  });
});

describe("Multi-Queue Scenarios", () => {
  let eventBus: EventBus;
  let queue: InMemoryQueue;

  beforeEach(() => {
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);
  });

  afterEach(async () => {
    await queue.clearAll();
  });

  bench("enqueue jobs to different documents", async () => {
    const job1 = createSimpleJob(`doc1-${Math.random()}`, "doc1");
    const job2 = createSimpleJob(`doc2-${Math.random()}`, "doc2");
    const job3 = createSimpleJob(`doc3-${Math.random()}`, "doc3");

    await queue.enqueue(job1);
    await queue.enqueue(job2);
    await queue.enqueue(job3);
  });

  bench("enqueue jobs to different scopes", async () => {
    const job1 = createSimpleJob(`scope1-${Math.random()}`, "doc1", "scope1");
    const job2 = createSimpleJob(`scope2-${Math.random()}`, "doc1", "scope2");
    const job3 = createSimpleJob(`scope3-${Math.random()}`, "doc1", "scope3");

    await queue.enqueue(job1);
    await queue.enqueue(job2);
    await queue.enqueue(job3);
  });

  bench("enqueue jobs to different branches", async () => {
    const job1 = createSimpleJob(
      `branch1-${Math.random()}`,
      "doc1",
      "default",
      "main",
    );
    const job2 = createSimpleJob(
      `branch2-${Math.random()}`,
      "doc1",
      "default",
      "feature",
    );
    const job3 = createSimpleJob(
      `branch3-${Math.random()}`,
      "doc1",
      "default",
      "develop",
    );

    await queue.enqueue(job1);
    await queue.enqueue(job2);
    await queue.enqueue(job3);
  });
});

describe("Batch Operations Performance", () => {
  let eventBus: EventBus;
  let queue: InMemoryQueue;

  beforeEach(() => {
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);
  });

  afterEach(async () => {
    await queue.clearAll();
  });

  bench("enqueue 10 simple jobs", async () => {
    const jobs = Array.from({ length: 10 }, (_, i) =>
      createSimpleJob(`batch-10-${i}-${Math.random()}`),
    );
    for (const job of jobs) {
      await queue.enqueue(job);
    }
  });

  bench("enqueue 50 simple jobs", async () => {
    const jobs = Array.from({ length: 50 }, (_, i) =>
      createSimpleJob(`batch-50-${i}-${Math.random()}`),
    );
    for (const job of jobs) {
      await queue.enqueue(job);
    }
  });

  bench("enqueue 10 complex jobs", async () => {
    const jobs = Array.from({ length: 10 }, (_, i) =>
      createComplexJob(`batch-complex-10-${i}-${Math.random()}`),
    );
    for (const job of jobs) {
      await queue.enqueue(job);
    }
  });
});

describe("Mixed Workload Performance", () => {
  let eventBus: EventBus;
  let queue: InMemoryQueue;
  let executor: InMemoryJobExecutor;

  beforeEach(async () => {
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);
    executor = new InMemoryJobExecutor(eventBus, queue);
    await executor.start({ maxConcurrency: 3, jobTimeout: 5000 });
  });

  afterEach(async () => {
    await executor.stop(false);
    await queue.clearAll();
  });

  bench("execute mixed simple and complex jobs", async () => {
    const simpleJob = createSimpleJob(`mixed-simple-${Math.random()}`);
    const complexJob = createComplexJob(`mixed-complex-${Math.random()}`);

    await executor.executeJob(simpleJob);
    await executor.executeJob(complexJob);
  });

  bench("execute 5 jobs with different complexities", async () => {
    const jobs = [
      createSimpleJob(`mix-1-${Math.random()}`),
      createComplexJob(`mix-2-${Math.random()}`),
      createSimpleJob(`mix-3-${Math.random()}`),
      createComplexJob(`mix-4-${Math.random()}`),
      createSimpleJob(`mix-5-${Math.random()}`),
    ];

    for (const job of jobs) {
      await executor.executeJob(job);
    }
  });
});
