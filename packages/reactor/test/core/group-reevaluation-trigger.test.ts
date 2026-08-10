import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { groupDocumentType } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../src/cache/operation-index-types.js";
import { GroupReevaluationTrigger } from "../../src/core/group-reevaluation-trigger.js";
import { EventBus } from "../../src/events/event-bus.js";
import type { JobWriteReadyEvent } from "../../src/events/types.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import type { IQueue } from "../../src/queue/interfaces.js";
import type { Job } from "../../src/queue/types.js";
import { createMockLogger } from "../factories.js";

function owc(
  documentId: string,
  documentType: string,
  scope: string,
  actionType: string,
  timestampUtcMs: string,
): OperationWithContext {
  return {
    operation: {
      id: `op-${actionType}-${timestampUtcMs}`,
      index: 0,
      skip: 0,
      hash: "h",
      timestampUtcMs,
      action: { id: "a", type: actionType, scope, timestampUtcMs, input: {} },
    },
    context: { documentId, documentType, scope, branch: "main" },
  } as never as OperationWithContext;
}

function harness(referencers: Record<string, string[]>) {
  const eventBus = new EventBus();
  const enqueued: Job[] = [];
  const queue = {
    enqueue: vi.fn().mockImplementation((job: Job) => {
      enqueued.push(job);
      return Promise.resolve();
    }),
  } as unknown as IQueue;
  const operationIndex = {
    getGroupReferencers: vi
      .fn()
      .mockImplementation((groupId: string) =>
        Promise.resolve(referencers[groupId] ?? []),
      ),
  } as unknown as IOperationIndex;

  const trigger = new GroupReevaluationTrigger(
    createMockLogger(),
    eventBus,
    queue,
    operationIndex,
  );
  trigger.startup();

  const emit = (operations: OperationWithContext[]) =>
    eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "job-1",
      operations,
      jobMeta: { batchId: "b", batchJobIds: ["job-1"] },
    } satisfies JobWriteReadyEvent);

  return { trigger, emit, enqueued, queue, operationIndex };
}

describe("GroupReevaluationTrigger", () => {
  it("enqueues one re-evaluation job per referencing document", async () => {
    const { emit, enqueued } = harness({ "g-1": ["doc-a", "doc-b"] });

    await emit([
      owc(
        "g-1",
        groupDocumentType,
        "global",
        "ADD_MEMBER",
        "2026-01-01T00:00:05.000Z",
      ),
    ]);

    expect(enqueued.map((job) => job.documentId).sort()).toEqual([
      "doc-a",
      "doc-b",
    ]);
    for (const job of enqueued) {
      expect(job.kind).toBe("reevaluation");
      expect(job.branch).toBe("main");
      expect(job.actions).toEqual([]);
      expect(job.operations).toEqual([]);
      expect(job.meta.triggerTimestampUtcMs).toBe("2026-01-01T00:00:05.000Z");
    }
  });

  it("carries the earliest membership timestamp across groups", async () => {
    const { emit, enqueued } = harness({
      "g-1": ["doc-a"],
      "g-2": ["doc-a"],
    });

    await emit([
      owc(
        "g-1",
        groupDocumentType,
        "global",
        "REMOVE_MEMBER",
        "2026-01-01T00:00:09.000Z",
      ),
      owc(
        "g-2",
        groupDocumentType,
        "global",
        "ADD_MEMBER",
        "2026-01-01T00:00:03.000Z",
      ),
    ]);

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].meta.triggerTimestampUtcMs).toBe(
      "2026-01-01T00:00:03.000Z",
    );
  });

  it("ignores writes that are not group membership changes", async () => {
    const { emit, enqueued, operationIndex } = harness({ "g-1": ["doc-a"] });

    await emit([
      // wrong document type
      owc(
        "doc-x",
        "powerhouse/document-model",
        "global",
        "ADD_MEMBER",
        "2026-01-01T00:00:01.000Z",
      ),
      // wrong scope
      owc(
        "g-1",
        groupDocumentType,
        "document",
        "ADD_MEMBER",
        "2026-01-01T00:00:01.000Z",
      ),
      // not a membership action
      owc(
        "g-1",
        groupDocumentType,
        "global",
        "SET_GROUP_NAME",
        "2026-01-01T00:00:01.000Z",
      ),
    ]);

    expect(enqueued).toHaveLength(0);
    expect(operationIndex.getGroupReferencers).not.toHaveBeenCalled();
  });

  it("stops enqueueing after shutdown", async () => {
    const { trigger, emit, enqueued } = harness({ "g-1": ["doc-a"] });
    trigger.shutdown();

    await emit([
      owc(
        "g-1",
        groupDocumentType,
        "global",
        "ADD_MEMBER",
        "2026-01-01T00:00:01.000Z",
      ),
    ]);

    expect(enqueued).toHaveLength(0);
  });
});
