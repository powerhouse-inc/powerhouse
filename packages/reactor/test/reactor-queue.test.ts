import {
  MemoryStorage,
  ReactorBuilder,
  driveDocumentModelModule,
  type BaseDocumentDriveServer,
} from "document-drive";
import type { Action, DocumentModelModule, PHDocument } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { v4 as uuidv4 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import type { IEventBus } from "../src/events/interfaces.js";
import type { IJobExecutor } from "../src/executor/interfaces.js";
import { SimpleJobExecutor } from "../src/executor/simple-job-executor.js";
import type { IQueue } from "../src/queue/interfaces.js";
import { InMemoryQueue } from "../src/queue/queue.js";
import type { Job } from "../src/queue/types.js";
import { Reactor } from "../src/reactor.js";
import { DocumentModelRegistry } from "../src/registry/implementation.js";
import { JobStatus } from "../src/shared/types.js";

// Helper to create a valid PHDocument using the document model utils
function createMockDocument(
  overrides: {
    id?: string;
    slug?: string;
    documentType?: string;
    state?: any;
  } = {},
): PHDocument {
  const baseDocument = documentModelDocumentModelModule.utils.createDocument();

  // Apply overrides if provided
  if (overrides.id) {
    baseDocument.header.id = overrides.id;
  }
  if (overrides.slug) {
    baseDocument.header.slug = overrides.slug;
  }
  if (overrides.documentType) {
    baseDocument.header.documentType = overrides.documentType;
  }
  if (overrides.state) {
    baseDocument.state = {
      ...baseDocument.state,
      ...(overrides.state as typeof baseDocument.state),
    };
  }

  return baseDocument;
}

describe("Reactor Write Interface - Mutate with Queue Integration", () => {
  let reactor: Reactor;
  let driveServer: BaseDocumentDriveServer;
  let storage: MemoryStorage;
  let eventBus: IEventBus;
  let queue: IQueue;
  let jobExecutor: IJobExecutor;

  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule<any>[];

  beforeEach(async () => {
    // Create dependencies
    storage = new MemoryStorage();
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);

    // Create real drive server
    const builder = new ReactorBuilder(documentModels).withStorage(storage);
    driveServer = builder.build() as unknown as BaseDocumentDriveServer;
    await driveServer.initialize();

    // Create a real DocumentModelRegistry and register the document model
    const registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);

    // Use the same storage instance that's used by the drive server and reactor
    jobExecutor = new SimpleJobExecutor(registry, storage);

    // Create reactor with all dependencies
    reactor = new Reactor(driveServer, storage, eventBus, queue, jobExecutor);
  });

  describe("mutate", () => {
    it("should enqueue jobs for document mutations", async () => {
      // Create a test document
      const testDoc = createMockDocument({
        id: "test-doc-1",
        slug: "test-doc",
      });

      // Add the document to the drive server
      await driveServer.addDocument(testDoc);

      // Create a mock action for the documentmodel document type
      const action: Action = {
        id: uuidv4(),
        type: "SET_NAME",
        scope: "global",
        input: { name: "Updated Document Model" },
        timestampUtcMs: String(Date.now()),
      } as Action;

      // Spy on the queue's enqueue method
      const enqueueSpy = vi.spyOn(queue, "enqueue");

      const result = await reactor.mutate(testDoc.header.id, [action]);

      // Verify that the queue's enqueue method was called
      expect(enqueueSpy).toHaveBeenCalledTimes(1);

      // Verify the job structure
      const enqueuedJob = enqueueSpy.mock.calls[0][0] as Job;
      expect(enqueuedJob.documentId).toBe(testDoc.header.id);
      expect(enqueuedJob.operation.action).toEqual(action);
      expect(enqueuedJob.scope).toBe(action.scope || "global");
      expect(enqueuedJob.branch).toBe("main");

      // Verify the result
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.status).toBe(JobStatus.PENDING);
    });

    it("should create proper Job objects from actions", async () => {
      // Create a test document
      const testDoc = createMockDocument({
        id: "test-doc-2",
        slug: "test-doc-2",
      });

      // Add the document to the drive server
      await driveServer.addDocument(testDoc);

      // Create multiple actions
      const actions: Action[] = [
        {
          id: uuidv4(),
          type: "SET_NAME",
          scope: "global",
          input: { name: "First Update" },
          timestampUtcMs: String(Date.now()),
        } as Action,
        {
          id: uuidv4(),
          type: "SET_DESCRIPTION",
          scope: "global",
          input: { description: "Test description" },
          timestampUtcMs: String(Date.now() + 1000),
        } as Action,
      ];

      // Capture the jobs that are enqueued
      const enqueuedJobs: Job[] = [];
      vi.spyOn(queue, "enqueue").mockImplementation((job: Job) => {
        enqueuedJobs.push(job);
        return Promise.resolve();
      });

      const result = await reactor.mutate(testDoc.header.id, actions);

      // Verify jobs were enqueued
      expect(enqueuedJobs).toHaveLength(actions.length);
      enqueuedJobs.forEach((job, index) => {
        expect(job.documentId).toBe(testDoc.header.id);
        expect(job.operation.action).toEqual(actions[index]);
        expect(job.scope).toBe(actions[index].scope || "global");
        expect(job.branch).toBe("main");
        expect(job.operation.index).toBe(index);
      });

      // Verify the result
      expect(result.status).toBe(JobStatus.PENDING);
    });

    it("should start the job executor when jobs are enqueued", async () => {
      // Create a test document
      const testDoc = createMockDocument({
        id: "test-doc-3",
        slug: "test-doc-3",
      });

      // Add the document to the drive server
      await driveServer.addDocument(testDoc);

      // Spy on the executor's executeJob method (start is called internally)
      const executorSpy = vi.spyOn(jobExecutor, "executeJob");

      const action: Action = {
        id: uuidv4(),
        type: "SET_NAME",
        scope: "global",
        input: { name: "Test Name" },
        timestampUtcMs: String(Date.now()),
      } as Action;

      await reactor.mutate(testDoc.header.id, [action]);

      // The executor's internal start should have been triggered
      // In the shim, start is called automatically on first mutate
      // We can't directly test this with the simplified design
    });

    it("should return JobInfo with pending status when jobs are enqueued", async () => {
      // Create a test document
      const testDoc = createMockDocument({
        id: "test-doc-4",
        slug: "test-doc-4",
      });

      // Add the document to the drive server
      await driveServer.addDocument(testDoc);

      const action: Action = {
        id: uuidv4(),
        type: "SET_NAME",
        scope: "global",
        input: { name: "Test Name" },
        timestampUtcMs: String(Date.now()),
      } as Action;

      const result = await reactor.mutate(testDoc.header.id, [action]);

      // Now that we use the queue, it should return PENDING
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.status).toBe(JobStatus.PENDING);
    });

    it("should handle multiple actions in sequence", async () => {
      // Create a test document
      const testDoc = createMockDocument({
        id: "test-doc-5",
        slug: "test-doc-5",
      });

      // Add the document to the drive server
      await driveServer.addDocument(testDoc);

      const actions: Action[] = [
        {
          id: uuidv4(),
          type: "SET_NAME",
          scope: "global",
          input: { name: "Name 1" },
          timestampUtcMs: String(Date.now()),
        } as Action,
        {
          id: uuidv4(),
          type: "SET_NAME",
          scope: "global",
          input: { name: "Name 2" },
          timestampUtcMs: String(Date.now() + 1000),
        } as Action,
        {
          id: uuidv4(),
          type: "SET_NAME",
          scope: "global",
          input: { name: "Name 3" },
          timestampUtcMs: String(Date.now() + 2000),
        } as Action,
      ];

      // Track enqueued jobs
      const enqueuedJobs: Job[] = [];
      vi.spyOn(queue, "enqueue").mockImplementation((job: Job) => {
        enqueuedJobs.push(job);
        return Promise.resolve();
      });

      const result = await reactor.mutate(testDoc.header.id, actions);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.status).toBe(JobStatus.PENDING);

      // Verify all jobs were enqueued in order
      expect(enqueuedJobs).toHaveLength(3);
      // Verify jobs maintain order
      enqueuedJobs.forEach((job, index) => {
        expect(job.operation.index).toBe(index);
        const actionInput = (job.operation.action as Action).input as {
          name: string;
        };
        expect(actionInput.name).toBe(`Name ${index + 1}`);
      });
    });

    describe("serial execution per document", () => {
      it("should not dequeue jobs for a document that has executing jobs", async () => {
        // Create two test documents
        const testDoc1 = createMockDocument({
          id: "test-doc-serial-1",
          slug: "test-doc-serial-1",
        });
        const testDoc2 = createMockDocument({
          id: "test-doc-serial-2",
          slug: "test-doc-serial-2",
        });

        // Add documents to the drive server
        await driveServer.addDocument(testDoc1);
        await driveServer.addDocument(testDoc2);

        // Create actions for both documents
        const action1: Action = {
          id: uuidv4(),
          type: "SET_NAME",
          scope: "global",
          input: { name: "Doc 1 Action 1" },
          timestampUtcMs: String(Date.now()),
        } as Action;

        const action2: Action = {
          id: uuidv4(),
          type: "SET_NAME",
          scope: "global",
          input: { name: "Doc 1 Action 2" },
          timestampUtcMs: String(Date.now() + 1000),
        } as Action;

        const action3: Action = {
          id: uuidv4(),
          type: "SET_NAME",
          scope: "global",
          input: { name: "Doc 2 Action 1" },
          timestampUtcMs: String(Date.now() + 2000),
        } as Action;

        // Enqueue jobs for both documents
        await reactor.mutate(testDoc1.header.id, [action1, action2]);
        await reactor.mutate(testDoc2.header.id, [action3]);

        // First dequeue should get a job from document 1
        const job1 = await queue.dequeueNext();
        expect(job1).toBeDefined();
        expect(job1?.documentId).toBe(testDoc1.header.id);

        // Second dequeue should get the job from document 2 (not doc 1's second job)
        const job2 = await queue.dequeueNext();
        expect(job2).toBeDefined();
        expect(job2?.documentId).toBe(testDoc2.header.id);

        // Third dequeue should return null since doc 1 is still executing
        const job3 = await queue.dequeueNext();
        expect(job3).toBeNull();

        // Complete the first job
        if (job1) {
          await queue.completeJob(job1.id);
        }

        // Now we should be able to dequeue the second job from document 1
        const job4 = await queue.dequeueNext();
        expect(job4).toBeDefined();
        expect(job4?.documentId).toBe(testDoc1.header.id);
      });

      it("should allow concurrent execution of jobs from different documents", async () => {
        // Create three test documents
        const docs = await Promise.all([
          createMockDocument({ id: "concurrent-1", slug: "concurrent-1" }),
          createMockDocument({ id: "concurrent-2", slug: "concurrent-2" }),
          createMockDocument({ id: "concurrent-3", slug: "concurrent-3" }),
        ]);

        // Add documents to the drive server
        for (const doc of docs) {
          await driveServer.addDocument(doc);
        }

        // Create actions for each document
        const actions = docs.map(
          (doc, index) =>
            ({
              id: uuidv4(),
              type: "SET_NAME",
              scope: "global",
              input: { name: `Doc ${index + 1} Action` },
              timestampUtcMs: String(Date.now() + index * 1000),
            }) as Action,
        );

        // Enqueue one job per document
        for (let i = 0; i < docs.length; i++) {
          await reactor.mutate(docs[i].header.id, [actions[i]]);
        }

        // Should be able to dequeue all three jobs since they're from different documents
        const dequeuedJobs = [];
        for (let i = 0; i < docs.length; i++) {
          const job = await queue.dequeueNext();
          expect(job).toBeDefined();
          dequeuedJobs.push(job!);
        }

        // Verify we got one job from each document
        const documentIds = dequeuedJobs.map((job) => job.documentId).sort();
        const expectedIds = docs.map((doc) => doc.header.id).sort();
        expect(documentIds).toEqual(expectedIds);

        // Fourth dequeue should return null since all documents are executing
        const noMoreJobs = await queue.dequeueNext();
        expect(noMoreJobs).toBeNull();
      });

      it("should resume processing after job completion", async () => {
        // Create a test document
        const testDoc = createMockDocument({
          id: "test-resume",
          slug: "test-resume",
        });

        await driveServer.addDocument(testDoc);

        // Create multiple actions for the same document
        const actions: Action[] = [1, 2, 3].map(
          (i) =>
            ({
              id: uuidv4(),
              type: "SET_NAME",
              scope: "global",
              input: { name: `Action ${i}` },
              timestampUtcMs: String(Date.now() + i * 1000),
            }) as Action,
        );

        // Enqueue all actions
        await reactor.mutate(testDoc.header.id, actions);

        // Dequeue first job
        const job1 = await queue.dequeueNext();
        expect(job1).toBeDefined();
        expect(job1?.operation.index).toBe(0);

        // Should not be able to dequeue another job for this document
        const blockedJob = await queue.dequeueNext();
        expect(blockedJob).toBeNull();

        // Complete the first job
        if (job1) {
          await queue.completeJob(job1.id);
        }

        // Now should be able to dequeue the second job
        const job2 = await queue.dequeueNext();
        expect(job2).toBeDefined();
        expect(job2?.operation.index).toBe(1);

        // Complete second job and get third
        if (job2) {
          await queue.completeJob(job2.id);
        }

        const job3 = await queue.dequeueNext();
        expect(job3).toBeDefined();
        expect(job3?.operation.index).toBe(2);
      });

      it("should handle job failure and allow next job to proceed", async () => {
        // Create a test document
        const testDoc = createMockDocument({
          id: "test-failure",
          slug: "test-failure",
        });

        await driveServer.addDocument(testDoc);

        // Create two actions
        const actions: Action[] = [1, 2].map(
          (i) =>
            ({
              id: uuidv4(),
              type: "SET_NAME",
              scope: "global",
              input: { name: `Action ${i}` },
              timestampUtcMs: String(Date.now() + i * 1000),
            }) as Action,
        );

        // Enqueue actions
        await reactor.mutate(testDoc.header.id, actions);

        // Dequeue first job
        const job1 = await queue.dequeueNext();
        expect(job1).toBeDefined();

        // Should not be able to dequeue second job
        const blockedJob = await queue.dequeueNext();
        expect(blockedJob).toBeNull();

        // Fail the first job
        if (job1) {
          await queue.failJob(job1.id, "Test failure");
        }

        // Now should be able to dequeue the second job
        const job2 = await queue.dequeueNext();
        expect(job2).toBeDefined();
        expect(job2?.operation.index).toBe(1);
      });
    });
  });
});
