import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import {
  ReactorEventTypes,
  type JobWriteReadyEvent,
} from "../../src/events/types.js";
import { InMemoryJobTracker } from "../../src/job-tracker/in-memory-job-tracker.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import {
  createEmptyConsistencyToken,
  createTestContext,
  createTestOperation,
} from "../factories.js";

const DOCUMENT_ID = "doc-1";

function operationFor(
  actionId: string,
  index: number,
  overrides: Partial<{ error: string; deniedReason: string }> = {},
): OperationWithContext {
  return {
    operation: createTestOperation(DOCUMENT_ID, {
      index,
      action: { id: actionId } as never,
      ...overrides,
    }),
    context: createTestContext({
      documentId: DOCUMENT_ID,
      documentType: "test/doc",
      scope: "global",
      branch: "main",
    }),
  };
}

function registered(tracker: InMemoryJobTracker, jobId: string): void {
  const jobInfo: JobInfo = {
    id: jobId,
    documentId: DOCUMENT_ID,
    status: JobStatus.PENDING,
    createdAtUtcIso: new Date().toISOString(),
    consistencyToken: createEmptyConsistencyToken(),
    meta: { batchId: jobId, batchJobIds: [jobId] },
  };
  tracker.registerJob(jobInfo);
  tracker.markRunning(jobId);
}

describe("InMemoryJobTracker job result", () => {
  let eventBus: EventBus;
  let tracker: InMemoryJobTracker;

  beforeEach(() => {
    eventBus = new EventBus();
    tracker = new InMemoryJobTracker(eventBus);
  });

  async function writeReady(
    event: Omit<JobWriteReadyEvent, "jobMeta">,
  ): Promise<void> {
    await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      ...event,
      jobMeta: { batchId: event.jobId, batchJobIds: [event.jobId] },
    } satisfies JobWriteReadyEvent);
  }

  it("reports every submitted action as applied when none was rejected", async () => {
    registered(tracker, "job-1");

    await writeReady({
      jobId: "job-1",
      operations: [operationFor("a", 0), operationFor("b", 1)],
      submittedActionIds: ["a", "b"],
    });

    const result = tracker.getJobStatus("job-1")?.result;
    expect(result?.allApplied).toBe(true);
    expect(result?.actions).toEqual([
      { actionId: "a", scope: "global", index: 0, kind: "applied" },
      { actionId: "b", scope: "global", index: 1, kind: "applied" },
    ]);
  });

  it("names the action a reducer rejected without failing the job", async () => {
    registered(tracker, "job-1");

    await writeReady({
      jobId: "job-1",
      operations: [
        operationFor("a", 0),
        operationFor("b", 1, { error: "Description exceeds 200 characters" }),
        operationFor("c", 2),
      ],
      submittedActionIds: ["a", "b", "c"],
    });

    const job = tracker.getJobStatus("job-1");
    expect(job?.status).toBe(JobStatus.WRITE_READY);
    expect(job?.error).toBeUndefined();
    expect(job?.result?.allApplied).toBe(false);
    expect(job?.result?.actions[1]).toEqual({
      actionId: "b",
      scope: "global",
      index: 1,
      kind: "reducer-error",
      message: "Description exceeds 200 characters",
    });
    expect(job?.result?.actions[0].kind).toBe("applied");
    expect(job?.result?.actions[2].kind).toBe("applied");
  });

  it("distinguishes a denial from a reducer error", async () => {
    registered(tracker, "job-1");

    await writeReady({
      jobId: "job-1",
      operations: [operationFor("a", 0, { deniedReason: "no write grant" })],
      submittedActionIds: ["a"],
    });

    const result = tracker.getJobStatus("job-1")?.result;
    expect(result?.allApplied).toBe(false);
    expect(result?.actions).toEqual([
      {
        actionId: "a",
        scope: "global",
        index: 0,
        kind: "denied",
        reason: "no write grant",
      },
    ]);
  });

  it("reports a denial ahead of a reducer error on the same operation", async () => {
    registered(tracker, "job-1");

    await writeReady({
      jobId: "job-1",
      operations: [
        operationFor("a", 0, { deniedReason: "no write grant", error: "boom" }),
      ],
      submittedActionIds: ["a"],
    });

    expect(tracker.getJobStatus("job-1")?.result?.actions[0].kind).toBe(
      "denied",
    );
  });

  it("ignores operations the job only moved into a new position", async () => {
    registered(tracker, "job-1");

    await writeReady({
      jobId: "job-1",
      operations: [
        operationFor("moved", 0, { error: "an older failure" }),
        operationFor("mine", 1),
      ],
      submittedActionIds: ["mine"],
    });

    const result = tracker.getJobStatus("job-1")?.result;
    expect(result?.allApplied).toBe(true);
    expect(result?.actions).toHaveLength(1);
    expect(result?.actions[0].actionId).toBe("mine");
  });

  it("leaves the result unset for a job that submitted no actions", async () => {
    registered(tracker, "job-1");

    await writeReady({
      jobId: "job-1",
      operations: [operationFor("from-a-remote", 0)],
      submittedActionIds: [],
    });

    expect(tracker.getJobStatus("job-1")?.result).toBeUndefined();
  });

  it("keeps the result once the job reaches READ_READY", async () => {
    registered(tracker, "job-1");

    await writeReady({
      jobId: "job-1",
      operations: [operationFor("a", 0, { error: "rejected" })],
      submittedActionIds: ["a"],
    });
    await eventBus.emit(ReactorEventTypes.JOB_READ_READY, {
      jobId: "job-1",
      operations: [],
    });

    const job = tracker.getJobStatus("job-1");
    expect(job?.status).toBe(JobStatus.READ_READY);
    expect(job?.result?.allApplied).toBe(false);
  });
});
