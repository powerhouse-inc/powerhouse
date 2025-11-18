import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
import type { Job } from "../../src/queue/types.js";
import { v4 as uuidv4 } from "uuid";
import type { Action } from "document-model";

describe("Batch mutation queue ordering", () => {
  let queue: InMemoryQueue;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);
  });

  afterEach(async () => {
    await queue.clearAll();
  });

  const createJob = (
    documentId: string,
    scope: string,
    branch: string,
    queueHint: string[] = [],
  ): Job => ({
    id: uuidv4(),
    kind: "mutation",
    documentId,
    scope,
    branch,
    actions: [
      {
        id: uuidv4(),
        type: "TEST_ACTION",
        scope,
        timestampUtcMs: new Date().toISOString(),
        input: {},
      } as Action,
    ],
    operations: [],
    createdAt: new Date().toISOString(),
    queueHint,
    maxRetries: 3,
    errorHistory: [],
  });

  it("should respect queueHint dependencies across documents", async () => {
    const job1Id = uuidv4();
    const job2Id = uuidv4();
    const job1: Job = {
      id: job1Id,
      kind: "mutation",
      documentId: "doc1",
      scope: "global",
      branch: "main",
      actions: [
        {
          id: uuidv4(),
          type: "TEST_ACTION",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: {},
        } as Action,
      ],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      maxRetries: 3,
      errorHistory: [],
    };
    const job2: Job = {
      id: job2Id,
      kind: "mutation",
      documentId: "doc2",
      scope: "global",
      branch: "main",
      actions: [
        {
          id: uuidv4(),
          type: "TEST_ACTION",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: {},
        } as Action,
      ],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [job1Id],
      maxRetries: 3,
      errorHistory: [],
    };
    await queue.enqueue(job1);
    await queue.enqueue(job2);
    const handle1 = await queue.dequeueNext();
    expect(handle1?.job.id).toBe(job1Id);
    const handle2Attempt = await queue.dequeueNext();
    expect(handle2Attempt).toBeNull();
    await queue.completeJob(job1Id);
    const handle2 = await queue.dequeueNext();
    expect(handle2?.job.id).toBe(job2Id);
  });

  it("should serialize jobs for same document even without queueHint", async () => {
    const job1 = createJob("doc1", "global", "main");
    const job2 = createJob("doc1", "global", "main");
    await queue.enqueue(job1);
    await queue.enqueue(job2);
    const handle1 = await queue.dequeueNext();
    expect(handle1?.job.id).toBe(job1.id);
    const handle2Attempt = await queue.dequeueNext();
    expect(handle2Attempt).toBeNull();
    await queue.completeJob(job1.id);
    const handle2 = await queue.dequeueNext();
    expect(handle2?.job.id).toBe(job2.id);
  });

  it("should handle complex dependency chain", async () => {
    const job1Id = uuidv4();
    const job2Id = uuidv4();
    const job3Id = uuidv4();
    const job1: Job = {
      id: job1Id,
      kind: "mutation",
      documentId: "doc1",
      scope: "global",
      branch: "main",
      actions: [
        {
          id: uuidv4(),
          type: "CREATE",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: {},
        } as Action,
      ],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      maxRetries: 3,
      errorHistory: [],
    };
    const job2: Job = {
      id: job2Id,
      kind: "mutation",
      documentId: "doc2",
      scope: "global",
      branch: "main",
      actions: [
        {
          id: uuidv4(),
          type: "ADD_FILE",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: {},
        } as Action,
      ],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [job1Id],
      maxRetries: 3,
      errorHistory: [],
    };
    const job3: Job = {
      id: job3Id,
      kind: "mutation",
      documentId: "doc2",
      scope: "document",
      branch: "main",
      actions: [
        {
          id: uuidv4(),
          type: "ADD_RELATIONSHIP",
          scope: "document",
          timestampUtcMs: new Date().toISOString(),
          input: {},
        } as Action,
      ],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [job2Id],
      maxRetries: 3,
      errorHistory: [],
    };
    await queue.enqueue(job1);
    await queue.enqueue(job2);
    await queue.enqueue(job3);
    const handle1 = await queue.dequeueNext();
    expect(handle1?.job.id).toBe(job1Id);
    expect(await queue.dequeueNext()).toBeNull();
    await queue.completeJob(job1Id);
    const handle2 = await queue.dequeueNext();
    expect(handle2?.job.id).toBe(job2Id);
    expect(await queue.dequeueNext()).toBeNull();
    await queue.completeJob(job2Id);
    const handle3 = await queue.dequeueNext();
    expect(handle3?.job.id).toBe(job3Id);
  });

  it("should allow parallel execution of independent jobs", async () => {
    const job1 = createJob("doc1", "global", "main");
    const job2 = createJob("doc2", "global", "main");
    const job3 = createJob("doc3", "global", "main");
    await queue.enqueue(job1);
    await queue.enqueue(job2);
    await queue.enqueue(job3);
    const handle1 = await queue.dequeueNext();
    const handle2 = await queue.dequeueNext();
    const handle3 = await queue.dequeueNext();
    expect(handle1).not.toBeNull();
    expect(handle2).not.toBeNull();
    expect(handle3).not.toBeNull();
    const dequeuedIds = [handle1?.job.id, handle2?.job.id, handle3?.job.id];
    expect(dequeuedIds).toContain(job1.id);
    expect(dequeuedIds).toContain(job2.id);
    expect(dequeuedIds).toContain(job3.id);
  });
});
