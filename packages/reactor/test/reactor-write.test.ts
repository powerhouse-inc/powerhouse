import {
  MemoryStorage,
  ReactorBuilder,
  driveDocumentModelModule,
  type IDocumentDriveServer,
} from "document-drive";
import type { Action, DocumentModelModule, PHDocument } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { v4 as uuidv4 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../src/queue/types.js";
import { Reactor } from "../src/reactor.js";
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
    baseDocument.state = { ...baseDocument.state, ...overrides.state };
  }

  return baseDocument;
}

describe("Reactor Write Interface - Mutate with Queue Integration", () => {
  let reactor: Reactor;
  let driveServer: IDocumentDriveServer;
  let storage: MemoryStorage;

  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule<any>[];

  beforeEach(async () => {
    // Set NODE_ENV to test to enable test internals access
    process.env.NODE_ENV = "test";

    // Create shared storage
    storage = new MemoryStorage();

    // Create real drive server with the storage
    const builder = new ReactorBuilder(documentModels);
    builder.withStorage(storage);
    driveServer = builder.build();
    await driveServer.initialize();

    // Create reactor with the drive server and storage
    // Note: Reactor expects BaseDocumentDriveServer but ReactorBuilder returns IDocumentDriveServer
    // This cast is safe because the implementation is BaseDocumentDriveServer
    reactor = new Reactor(driveServer as any, storage);
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

      // Spy on the internal queue's enqueue method
      const internals = reactor._testInternals;
      const enqueueSpy = vi.spyOn(internals.queue, "enqueue");

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
      const internals = reactor._testInternals;
      vi.spyOn(internals.queue, "enqueue").mockImplementation(async (job: Job) => {
        enqueuedJobs.push(job);
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

      // Spy on the internal executor's start method
      const internals = reactor._testInternals;
      const executorStartSpy = vi.spyOn(internals.jobExecutor, "start");

      const action: Action = {
        id: uuidv4(),
        type: "SET_NAME",
        scope: "global",
        input: { name: "Test Name" },
        timestampUtcMs: String(Date.now()),
      } as Action;

      await reactor.mutate(testDoc.header.id, [action]);

      // The executor should be started
      expect(executorStartSpy).toHaveBeenCalledTimes(1);
      expect(executorStartSpy).toHaveBeenCalledWith({
        maxConcurrency: 5,
        jobTimeout: 30000,
      });
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
      const internals = reactor._testInternals;
      vi.spyOn(internals.queue, "enqueue").mockImplementation(async (job: Job) => {
        enqueuedJobs.push(job);
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
        const actionInput = (job.operation.action as Action).input as { name: string };
        expect(actionInput.name).toBe(`Name ${index + 1}`);
      });
    });
  });
});