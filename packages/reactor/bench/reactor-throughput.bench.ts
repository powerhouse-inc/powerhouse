import { MemoryStorage } from "document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { beforeAll, bench, describe } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { SimpleJobExecutor } from "../src/executor/simple-job-executor.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import type { Job } from "../src/queue/types.js";
import { DocumentModelRegistry } from "../src/registry/implementation.js";
import {
  createDocumentModelAction,
  createTestOperation,
} from "../test/factories.js";

// Pre-create shared components to avoid setup overhead
const eventBus = new EventBus();
const queue = new InMemoryQueue(eventBus);

// Create registry with real document model
const registry = new DocumentModelRegistry();
registry.registerModules(documentModelDocumentModelModule);

// Use real storage
const storage = new MemoryStorage();

// Create real executor with real storage
const executor = new SimpleJobExecutor(registry, storage, storage);

// Pre-create a document for benchmarks
const testDocument = documentModelDocumentModelModule.utils.createDocument();
testDocument.header.id = "doc1";

let jobCounter = 0;

function createSimpleJob(): Job {
  const action = createDocumentModelAction("SET_NAME", {
    input: { name: `Test Name ${++jobCounter}` },
  });
  const operation = createTestOperation({ action });

  return {
    id: `job-${jobCounter}`,
    documentId: "doc1",
    scope: "global",
    branch: "main",
    operation,
    maxRetries: 0,
    createdAt: new Date().toISOString(),
    queueHint: [],
  };
}

function createComplexJob(): Job {
  const action = createDocumentModelAction("SET_DESCRIPTION", {
    input: {
      description: Array.from(
        { length: 100 },
        (_, i) => `Description line ${i}`,
      ).join("\n"),
    },
  });
  const operation = createTestOperation({
    action,
    index: Math.floor(Math.random() * 1000),
  });

  return {
    id: `job-${++jobCounter}`,
    documentId: "doc1",
    scope: "global",
    branch: "main",
    operation,
    maxRetries: 0,
    createdAt: new Date().toISOString(),
    queueHint: [],
  };
}

describe("Queue Throughput", () => {
  beforeAll(async () => {
    await storage.create(testDocument);
  });

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
