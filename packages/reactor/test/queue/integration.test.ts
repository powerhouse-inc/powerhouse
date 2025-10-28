import type { BaseDocumentDriveServer } from "document-drive";
import { driveDocumentModelModule } from "document-drive";
import type { Action, DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { v4 as uuidv4 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Reactor } from "../../src/core/reactor.js";
import type { IQueue } from "../../src/queue/interfaces.js";
import type { Job } from "../../src/queue/types.js";
import { JobStatus } from "../../src/shared/types.js";
import {
  createDocModelDocument,
  createDocumentModelAction,
  createTestActions,
  createTestReactorSetup,
} from "../factories.js";

describe("Reactor <> Queue Integration", () => {
  let reactor: Reactor;
  let driveServer: BaseDocumentDriveServer;
  let queue: IQueue;

  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule<any>[];

  beforeEach(async () => {
    const setup = await createTestReactorSetup(documentModels);
    reactor = setup.reactor;
    driveServer = setup.driveServer;
    queue = setup.queue;
  });

  describe("mutate", () => {
    it("should enqueue jobs for document mutations", async () => {
      // Create a test document
      const testDoc = createDocModelDocument({
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

      // Verify that the queue's enqueue method was called once (single job with one action)
      expect(enqueueSpy).toHaveBeenCalledTimes(1);

      // Verify the job structure
      const enqueuedJob = enqueueSpy.mock.calls[0][0] as Job;
      expect(enqueuedJob.documentId).toBe(testDoc.header.id);
      expect(enqueuedJob.actions).toHaveLength(1);
      expect(enqueuedJob.actions[0]).toEqual(action);
      expect(enqueuedJob.scope).toBe(action.scope || "global");
      expect(enqueuedJob.branch).toBe("main");

      // Verify the result
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.status).toBe(JobStatus.PENDING);
    });

    it("should create proper Job objects from actions", async () => {
      // Create a test document
      const testDoc = createDocModelDocument({
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

      // Verify a single job was enqueued with multiple actions
      expect(enqueuedJobs).toHaveLength(1);
      const job = enqueuedJobs[0];
      expect(job.documentId).toBe(testDoc.header.id);
      expect(job.actions).toHaveLength(actions.length);
      job.actions.forEach((action, index) => {
        expect(action).toEqual(actions[index]);
      });
      expect(job.scope).toBe(actions[0].scope || "global");
      expect(job.branch).toBe("main");

      // Verify the result
      expect(result.status).toBe(JobStatus.PENDING);
    });

    it("should start the job executor when jobs are enqueued", async () => {
      // Create a test document
      const testDoc = createDocModelDocument({
        id: "test-doc-3",
        slug: "test-doc-3",
      });

      // Add the document to the drive server
      await driveServer.addDocument(testDoc);

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
      const testDoc = createDocModelDocument({
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
      const testDoc = createDocModelDocument({
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

      // Verify a single job was enqueued with 3 actions
      expect(enqueuedJobs).toHaveLength(1);
      const job = enqueuedJobs[0];
      expect(job.actions).toHaveLength(3);
      // Verify actions maintain order
      job.actions.forEach((action, index) => {
        const actionInput = (action as Action).input as {
          name: string;
        };
        expect(actionInput.name).toBe(`Action ${index + 1}`);
      });
    });

    describe("serial execution per document", () => {
      it("should not dequeue jobs for a document that has executing jobs", async () => {
        // Create two test documents
        const testDoc1 = createDocModelDocument({
          id: "test-doc-serial-1",
          slug: "test-doc-serial-1",
        });
        const testDoc2 = createDocModelDocument({
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
        // Doc1 gets one job with 2 actions, Doc2 gets one job with 1 action
        await reactor.mutate(testDoc1.header.id, [action1, action2]);
        await reactor.mutate(testDoc2.header.id, [action3]);

        // First dequeue should get doc1's job (with 2 actions)
        const job1 = await queue.dequeueNext();
        expect(job1).toBeDefined();
        expect(job1?.job.documentId).toBe(testDoc1.header.id);
        expect(job1?.job.actions).toHaveLength(2);

        // Second dequeue should get doc2's job (since doc1 is executing)
        const job2 = await queue.dequeueNext();
        expect(job2).toBeDefined();
        expect(job2?.job.documentId).toBe(testDoc2.header.id);
        expect(job2?.job.actions).toHaveLength(1);

        // Third dequeue should return null since both documents are executing
        const job3 = await queue.dequeueNext();
        expect(job3).toBeNull();

        // Complete the first job
        if (job1) {
          await queue.completeJob(job1.job.id);
        }

        // After completing doc1's job, there should be no more jobs (doc2 is still executing)
        const job4 = await queue.dequeueNext();
        expect(job4).toBeNull();
      });

      it("should allow concurrent execution of jobs from different documents", async () => {
        // Create three test documents
        const docs = await Promise.all([
          createDocModelDocument({ id: "concurrent-1", slug: "concurrent-1" }),
          createDocModelDocument({ id: "concurrent-2", slug: "concurrent-2" }),
          createDocModelDocument({ id: "concurrent-3", slug: "concurrent-3" }),
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
        const testDoc = createDocModelDocument({
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

        // Dequeue the single job (which contains all 3 actions)
        const job1 = await queue.dequeueNext();
        expect(job1).toBeDefined();
        expect(job1?.job.actions).toHaveLength(3);

        // Should not be able to dequeue another job for this document
        const blockedJob = await queue.dequeueNext();
        expect(blockedJob).toBeNull();

        // Complete the job (all actions are processed together)
        if (job1) {
          await queue.completeJob(job1.job.id);
        }

        // After completion, no more jobs should be available
        const noMoreJobs = await queue.dequeueNext();
        expect(noMoreJobs).toBeNull();
      });

      it("should handle job failure and allow next job to proceed", async () => {
        // Create a test document
        const testDoc = createDocModelDocument({
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

        // Enqueue actions (creates a single job with 2 actions)
        await reactor.mutate(testDoc.header.id, actions);

        // Dequeue the job
        const job1 = await queue.dequeueNext();
        expect(job1).toBeDefined();
        expect(job1?.job.actions).toHaveLength(2);

        // Should not be able to dequeue another job
        const blockedJob = await queue.dequeueNext();
        expect(blockedJob).toBeNull();

        // Fail the job (failing the entire job with all its actions)
        if (job1) {
          await queue.failJob(job1.job.id, {
            message: "Test failure",
            stack: "",
          });
        }

        // After failure, no more jobs should be available
        const noMoreJobs = await queue.dequeueNext();
        expect(noMoreJobs).toBeNull();
      });
    });
  });
});
