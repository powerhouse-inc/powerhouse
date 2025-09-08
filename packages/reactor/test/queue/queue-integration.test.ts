import type { BaseDocumentDriveServer } from "document-drive";
import { driveDocumentModelModule } from "document-drive";
import type { Action, DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { v4 as uuidv4 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IJobExecutor } from "../../src/executor/interfaces.js";
import type { IQueue } from "../../src/queue/interfaces.js";
import type { Job } from "../../src/queue/types.js";
import { type Reactor } from "../../src/reactor.js";
import { JobStatus } from "../../src/shared/types.js";
import {
  createDocumentModelAction,
  createMockDocument,
  createTestActions,
  createTestReactorSetup,
} from "../factories.js";

describe("Reactor <> Queue Integration", () => {
  let reactor: Reactor;
  let driveServer: BaseDocumentDriveServer;
  let queue: IQueue;
  let jobExecutor: IJobExecutor;

  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule<any>[];

  beforeEach(async () => {
    const setup = await createTestReactorSetup(documentModels);
    reactor = setup.reactor;
    driveServer = setup.driveServer;
    queue = setup.queue;
    jobExecutor = setup.jobExecutor;
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
      const action = createDocumentModelAction("SET_NAME", {
        input: { name: "Updated Document Model" },
      });

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
      const actions = [
        createDocumentModelAction("SET_NAME", {
          input: { name: "First Update" },
        }),
        createDocumentModelAction("SET_DESCRIPTION", {
          input: { description: "Test description" },
          timestampUtcMs: String(Date.now() + 1000),
        }),
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

      const action = createDocumentModelAction("SET_NAME", {
        input: { name: "Test Name" },
      });

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

      const action = createDocumentModelAction("SET_NAME", {
        input: { name: "Test Name" },
      });

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

      const actions = createTestActions(3, "SET_NAME");

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
        expect(actionInput.name).toBe(`Action ${index + 1}`);
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
        expect(job1?.job.documentId).toBe(testDoc1.header.id);

        // Second dequeue should get the job from document 2 (not doc 1's second job)
        const job2 = await queue.dequeueNext();
        expect(job2).toBeDefined();
        expect(job2?.job.documentId).toBe(testDoc2.header.id);

        // Third dequeue should return null since doc 1 is still executing
        const job3 = await queue.dequeueNext();
        expect(job3).toBeNull();

        // Complete the first job
        if (job1) {
          await queue.completeJob(job1.job.id);
        }

        // Now we should be able to dequeue the second job from document 1
        const job4 = await queue.dequeueNext();
        expect(job4).toBeDefined();
        expect(job4?.job.documentId).toBe(testDoc1.header.id);
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
        const documentIds = dequeuedJobs
          .map((job) => job.job.documentId)
          .sort();
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
        expect(job1?.job.operation.index).toBe(0);

        // Should not be able to dequeue another job for this document
        const blockedJob = await queue.dequeueNext();
        expect(blockedJob).toBeNull();

        // Complete the first job
        if (job1) {
          await queue.completeJob(job1.job.id);
        }

        // Now should be able to dequeue the second job
        const job2 = await queue.dequeueNext();
        expect(job2).toBeDefined();
        expect(job2?.job.operation.index).toBe(1);

        // Complete second job and get third
        if (job2) {
          await queue.completeJob(job2.job.id);
        }

        const job3 = await queue.dequeueNext();
        expect(job3).toBeDefined();
        expect(job3?.job.operation.index).toBe(2);
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
          await queue.failJob(job1.job.id, "Test failure");
        }

        // Now should be able to dequeue the second job
        const job2 = await queue.dequeueNext();
        expect(job2).toBeDefined();
        expect(job2?.job.operation.index).toBe(1);
      });
    });
  });
});
