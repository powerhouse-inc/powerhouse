import { bench, describe } from "vitest";
import { documentModelDocumentModelModule } from "document-model";
import { EventBus } from "../src/events/event-bus.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import { type Job } from "../src/queue/types.js";
import { SimpleJobExecutor } from "../src/executor/simple-job-executor.js";
import { DocumentModelRegistry } from "../src/registry/implementation.js";

// Pre-create shared components to avoid setup overhead
const eventBus = new EventBus();
const queue = new InMemoryQueue(eventBus);

// Create registry and mock storage for executor
const registry = new DocumentModelRegistry();
registry.registerModules(documentModelDocumentModelModule);

const mockDocStorage = {
  get: async () => ({
    header: { documentType: 'powerhouse/document-model' },
    operations: { global: [] },
    state: {},
  }),
  set: async () => {},
  delete: async () => {},
  exists: async () => false,
  getChildren: async () => [],
  findByType: async () => [],
  resolveIds: async () => [],
} as any;

const executor = new SimpleJobExecutor(registry, mockDocStorage);

let jobCounter = 0;

function createSimpleJob(): Job {
  return {
    id: `job-${++jobCounter}`,
    documentId: "doc1",
    scope: "default",
    branch: "main",
    operation: {
      action: {
        id: `action-${jobCounter}`,
        type: "CREATE",
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
        input: { data: "simple data" },
        scope: "default",
      },
      index: 0,
      timestampUtcMs: "2023-01-01T00:00:00.000Z",
      hash: "hash-123",
      skip: 0,
    },
    maxRetries: 0,
    createdAt: "2023-01-01T00:00:00.000Z",
  };
}

function createComplexJob(): Job {
  return {
    id: `job-${++jobCounter}`,
    documentId: "doc1",
    scope: "default",
    branch: "main",
    operation: {
      action: {
        id: `action-${jobCounter}`,
        type: "UPDATE",
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
        input: {
          data: Array.from({ length: 100 }, (_, i) => `item ${i}`),
          metadata: { timestampUtcMs: Date.now(), user: "test" },
        },
        scope: "default",
      },
      index: Math.floor(Math.random() * 1000),
      timestampUtcMs: "2023-01-01T00:00:00.000Z",
      hash: "hash-456",
      skip: 0,
    },
    maxRetries: 0,
    createdAt: "2023-01-01T00:00:00.000Z",
  };
}

describe("Queue Throughput", () => {
  bench("enqueue simple job", async () => {
    const job = createSimpleJob();
    await queue.enqueue(job);
  });

  bench("enqueue complex job", async () => {
    const job = createComplexJob();
    await queue.enqueue(job);
  });

  bench("enqueue then dequeue", async () => {
    const job = createSimpleJob();
    await queue.enqueue(job);
    await queue.dequeue(job.documentId, job.scope, job.branch);
  });

  bench("dequeue next available", async () => {
    // Ensure there's always a job to dequeue
    const job = createSimpleJob();
    await queue.enqueue(job);
    await queue.dequeueNext();
  });

  bench("queue operations", async () => {
    await queue.totalSize();
  });
});

describe("Job Executor Throughput", () => {
  bench("execute simple job", async () => {
    const job = createSimpleJob();
    await executor.executeJob(job);
  });

  bench("execute complex job", async () => {
    const job = createComplexJob();
    await executor.executeJob(job);
  });

  // Status and stats checks are now on the manager, not individual executors
});

describe("End-to-End Throughput", () => {
  bench("enqueue with event emission", async () => {
    const job = createSimpleJob();
    await queue.enqueue(job); // This emits events
  });

  bench("multi-document operations", async () => {
    const job1 = { ...createSimpleJob(), documentId: "doc1" };
    const job2 = { ...createSimpleJob(), documentId: "doc2" };
    const job3 = { ...createSimpleJob(), documentId: "doc3" };

    await queue.enqueue(job1);
    await queue.enqueue(job2);
    await queue.enqueue(job3);
  });

  bench("batch job creation", async () => {
    const jobs = Array.from({ length: 10 }, () => createSimpleJob());
    for (const job of jobs) {
      await queue.enqueue(job);
    }
  });

  bench("mixed workload", async () => {
    const simpleJob = createSimpleJob();
    const complexJob = createComplexJob();

    await executor.executeJob(simpleJob);
    await executor.executeJob(complexJob);
  });
});

describe("Performance Scaling", () => {
  bench("5 simple jobs", async () => {
    const jobs = Array.from({ length: 5 }, () => createSimpleJob());
    for (const job of jobs) {
      await executor.executeJob(job);
    }
  });

  bench("5 complex jobs", async () => {
    const jobs = Array.from({ length: 5 }, () => createComplexJob());
    for (const job of jobs) {
      await executor.executeJob(job);
    }
  });

  bench("mixed 10 jobs", async () => {
    const jobs = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0 ? createSimpleJob() : createComplexJob(),
    );
    for (const job of jobs) {
      await executor.executeJob(job);
    }
  });
});
