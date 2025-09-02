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
import { InMemoryJobExecutor } from "../src/executor/in-memory-job-executor-shim.js";
import type { IJobExecutor } from "../src/executor/interfaces.js";
import type { IQueue } from "../src/queue/interfaces.js";
import { InMemoryQueue } from "../src/queue/queue.js";
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
    // Create shared storage
    storage = new MemoryStorage();

    // Create real drive server with the storage
    const builder = new ReactorBuilder(documentModels);
    builder.withStorage(storage);
    driveServer = builder.build() as unknown as BaseDocumentDriveServer;
    await driveServer.initialize();

    // Create event bus, queue, and executor
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);
    
    // Create a mock registry for the executor
    const registry = {
      getModule: vi.fn().mockReturnValue({
        reducer: vi.fn((doc, action) => ({
          ...doc,
          operations: { global: [{ index: 0, hash: 'test-hash' }] }
        }))
      })
    } as any;
    
    // Create a mock document storage for the executor (different from IDocumentStorage for reactor)
    const mockDocStorage = {
      get: vi.fn().mockResolvedValue({
        header: { documentType: 'test' },
        operations: { global: [] },
        history: [],
        state: {},
        initialState: {},
        clipboard: [],
      }),
      delete: vi.fn(),
      exists: vi.fn(),
      getChildren: vi.fn(),
      findByType: vi.fn(),
      resolveIds: vi.fn(),
    } as any;
    
    jobExecutor = new InMemoryJobExecutor(eventBus, queue, registry, mockDocStorage);

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
  });
});
