import type { BaseDocumentDriveServer, IDocumentStorage } from "document-drive";
import type { Action } from "document-model";
import { v4 as uuidv4 } from "uuid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Reactor } from "../../src/core/reactor.js";
import type { BatchMutationRequest } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import { InMemoryJobTracker } from "../../src/job-tracker/in-memory-job-tracker.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
import { ReadModelCoordinator } from "../../src/read-models/coordinator.js";
import { JobStatus } from "../../src/shared/types.js";

describe("Batch mutation end-to-end", () => {
  let reactor: Reactor;
  let queue: InMemoryQueue;
  let jobTracker: InMemoryJobTracker;

  beforeEach(() => {
    const driveServer = {
      getDocumentModelModules: () => [],
    } as unknown as BaseDocumentDriveServer;
    const storage = {} as IDocumentStorage;
    const eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);
    jobTracker = new InMemoryJobTracker();
    const readModelCoordinator = new ReadModelCoordinator(eventBus, []);
    readModelCoordinator.start();
    reactor = new Reactor(
      driveServer,
      storage,
      queue,
      jobTracker,
      readModelCoordinator,
    );
  });

  afterEach(async () => {
    await queue.clearAll();
  });

  it("should execute document-drive orchestration scenario with dependencies", async () => {
    const childId = uuidv4();
    const parentId = uuidv4();
    const createAction: Action = {
      id: uuidv4(),
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: new Date().toISOString(),
      input: {
        documentId: childId,
        documentType: "powerhouse/document-model",
      },
    };
    const upgradeAction: Action = {
      id: uuidv4(),
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: new Date().toISOString(),
      input: {
        version: "1.0.0",
      },
    };
    const addFileAction: Action = {
      id: uuidv4(),
      type: "ADD_FILE",
      scope: "global",
      timestampUtcMs: new Date().toISOString(),
      input: {
        id: childId,
        name: "new-document",
      },
    };
    const addRelationshipAction: Action = {
      id: uuidv4(),
      type: "ADD_RELATIONSHIP",
      scope: "document",
      timestampUtcMs: new Date().toISOString(),
      input: {
        sourceId: parentId,
        targetId: childId,
        relationshipType: "child",
      },
    };
    const request: BatchMutationRequest = {
      jobs: [
        {
          key: "createChild",
          documentId: childId,
          scope: "document",
          branch: "main",
          actions: [createAction, upgradeAction],
          dependsOn: [],
        },
        {
          key: "addFile",
          documentId: parentId,
          scope: "global",
          branch: "main",
          actions: [addFileAction],
          dependsOn: ["createChild"],
        },
        {
          key: "linkChild",
          documentId: parentId,
          scope: "document",
          branch: "main",
          actions: [addRelationshipAction],
          dependsOn: ["addFile"],
        },
      ],
    };
    const result = await reactor.mutateBatch(request);
    expect(result.jobs).toHaveProperty("createChild");
    expect(result.jobs).toHaveProperty("addFile");
    expect(result.jobs).toHaveProperty("linkChild");
    expect(result.jobs.createChild.status).toBe(JobStatus.PENDING);
    expect(result.jobs.addFile.status).toBe(JobStatus.PENDING);
    expect(result.jobs.linkChild.status).toBe(JobStatus.PENDING);
    const handle1 = await queue.dequeueNext();
    expect(handle1).not.toBeNull();
    expect(handle1?.job.documentId).toBe(childId);
    expect(handle1?.job.scope).toBe("document");
    const handle2Attempt = await queue.dequeueNext();
    expect(handle2Attempt).toBeNull();
    await queue.completeJob(handle1!.job.id);
    const handle2 = await queue.dequeueNext();
    expect(handle2).not.toBeNull();
    expect(handle2?.job.documentId).toBe(parentId);
    expect(handle2?.job.scope).toBe("global");
    const handle3Attempt = await queue.dequeueNext();
    expect(handle3Attempt).toBeNull();
    await queue.completeJob(handle2!.job.id);
    const handle3 = await queue.dequeueNext();
    expect(handle3).not.toBeNull();
    expect(handle3?.job.documentId).toBe(parentId);
    expect(handle3?.job.scope).toBe("document");
    await queue.completeJob(handle3!.job.id);
    const handle4 = await queue.dequeueNext();
    expect(handle4).toBeNull();
  });

  it("should handle batch with parallel and dependent jobs", async () => {
    const doc1Id = uuidv4();
    const doc2Id = uuidv4();
    const doc3Id = uuidv4();
    const request: BatchMutationRequest = {
      jobs: [
        {
          key: "job1",
          documentId: doc1Id,
          scope: "global",
          branch: "main",
          actions: [
            {
              id: uuidv4(),
              type: "ACTION_1",
              scope: "global",
              timestampUtcMs: new Date().toISOString(),
              input: {},
            },
          ],
          dependsOn: [],
        },
        {
          key: "job2",
          documentId: doc2Id,
          scope: "global",
          branch: "main",
          actions: [
            {
              id: uuidv4(),
              type: "ACTION_2",
              scope: "global",
              timestampUtcMs: new Date().toISOString(),
              input: {},
            },
          ],
          dependsOn: [],
        },
        {
          key: "job3",
          documentId: doc3Id,
          scope: "global",
          branch: "main",
          actions: [
            {
              id: uuidv4(),
              type: "ACTION_3",
              scope: "global",
              timestampUtcMs: new Date().toISOString(),
              input: {},
            },
          ],
          dependsOn: ["job1", "job2"],
        },
      ],
    };
    const result = await reactor.mutateBatch(request);
    expect(result.jobs).toHaveProperty("job1");
    expect(result.jobs).toHaveProperty("job2");
    expect(result.jobs).toHaveProperty("job3");
    const handle1 = await queue.dequeueNext();
    const handle2 = await queue.dequeueNext();
    expect(handle1).not.toBeNull();
    expect(handle2).not.toBeNull();
    const handle3PreComplete = await queue.dequeueNext();
    expect(handle3PreComplete).toBeNull();
    await queue.completeJob(handle1!.job.id);
    await queue.completeJob(handle2!.job.id);
    const handle3 = await queue.dequeueNext();
    expect(handle3).not.toBeNull();
    expect(handle3?.job.documentId).toBe(doc3Id);
  });
});
