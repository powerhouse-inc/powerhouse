import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import { InMemoryJobTracker } from "../../src/job-tracker/in-memory-job-tracker.js";
import type { Job } from "../../src/queue/types.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";

function info(id: string, status = JobStatus.PENDING): JobInfo {
  return {
    id,
    documentId: "doc",
    status,
    createdAtUtcIso: new Date().toISOString(),
    consistencyToken: { version: 1, createdAtUtcIso: "", coordinates: [] },
    meta: { batchId: id, batchJobIds: [id] },
  };
}

const failure = { name: "Error", message: "boom", stack: "" };

describe("InMemoryJobTracker.stats", () => {
  it("follows a job's transitions", async () => {
    const bus = new EventBus();
    const tracker = new InMemoryJobTracker(bus);
    tracker.registerJob(info("a"));
    tracker.registerJob(info("b"));
    expect(tracker.stats()).toMatchObject({ size: 2, pending: 2, running: 0 });

    tracker.markRunning("a");
    expect(tracker.stats()).toMatchObject({ pending: 1, running: 1 });

    await bus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "a",
      operations: [],
      submittedActionIds: [],
    });
    expect(tracker.stats()).toMatchObject({ running: 0, writeReady: 1 });

    await bus.emit(ReactorEventTypes.JOB_READ_READY, { jobId: "a" });
    expect(tracker.stats()).toMatchObject({ writeReady: 0, readReady: 1 });
    tracker.shutdown();
  });

  it("counts what failed jobs hold, once per job", () => {
    const tracker = new InMemoryJobTracker(new EventBus());
    const job = {
      actions: [{ input: "x".repeat(1000) }],
      operations: [],
    } as unknown as Job;
    tracker.registerJob(info("a"));

    tracker.markFailed("a", failure, job);
    const { failed, failedWithPayload, failedPayloadBytes } = tracker.stats();
    expect(failed).toBe(1);
    expect(failedWithPayload).toBe(1);
    expect(failedPayloadBytes).toBeGreaterThan(1000);

    tracker.markFailed("a", failure, job);
    expect(tracker.stats().failedPayloadBytes).toBe(failedPayloadBytes);

    tracker.registerJob(info("a"));
    expect(tracker.stats()).toMatchObject({
      failed: 0,
      failedWithPayload: 0,
      failedPayloadBytes: 0,
    });
    tracker.shutdown();
  });

  it("counts a failure with no payload", () => {
    const tracker = new InMemoryJobTracker(new EventBus());
    tracker.markFailed("a", failure);
    expect(tracker.stats()).toMatchObject({ failed: 1, failedWithPayload: 0 });
    tracker.shutdown();
  });
});

describe("ConsistencyTracker.stats", () => {
  it("counts keys and waiters", async () => {
    const tracker = new ConsistencyTracker();
    const coordinate = {
      documentId: "d",
      scope: "global",
      branch: "main",
      operationIndex: 1,
    };
    tracker.update([coordinate]);
    expect(tracker.stats()).toEqual({ keys: 1, waiters: 0 });

    const waited = tracker.waitFor([{ ...coordinate, operationIndex: 2 }]);
    expect(tracker.stats().waiters).toBe(1);
    tracker.update([{ ...coordinate, operationIndex: 2 }]);
    await vi.waitFor(() => expect(tracker.stats().waiters).toBe(0));
    await waited;
  });
});
