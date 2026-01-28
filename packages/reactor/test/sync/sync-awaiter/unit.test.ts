import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../../src/events/event-bus.js";
import { SyncAwaiter } from "../../../src/sync/sync-awaiter.js";
import {
  SyncEventTypes,
  type SyncFailedEvent,
  type SyncSucceededEvent,
} from "../../../src/sync/types.js";

describe("SyncAwaiter", () => {
  let eventBus: EventBus;
  let awaiter: SyncAwaiter;

  beforeEach(() => {
    eventBus = new EventBus();
    awaiter = new SyncAwaiter(eventBus);
  });

  afterEach(() => {
    awaiter.shutdown();
  });

  it("waitForSync resolves on SYNC_SUCCEEDED", async () => {
    const jobId = "test-job-1";
    const promise = awaiter.waitForSync(jobId);

    const event: SyncSucceededEvent = {
      jobId,
      syncOperationCount: 3,
    };
    await eventBus.emit(SyncEventTypes.SYNC_SUCCEEDED, event);

    const result = await promise;
    expect(result.jobId).toBe(jobId);
    expect(result.status).toBe("succeeded");
    expect(result.syncOperationCount).toBe(3);
    expect(result.successCount).toBe(3);
    expect(result.failureCount).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("waitForSync rejects on SYNC_FAILED", async () => {
    const jobId = "test-job-2";
    const promise = awaiter.waitForSync(jobId);

    const event: SyncFailedEvent = {
      jobId,
      successCount: 2,
      failureCount: 1,
      errors: [
        {
          remoteName: "remote1",
          documentId: "doc1",
          error: "Network error",
        },
      ],
    };
    await eventBus.emit(SyncEventTypes.SYNC_FAILED, event);

    const result = await promise;
    expect(result.jobId).toBe(jobId);
    expect(result.status).toBe("failed");
    expect(result.syncOperationCount).toBe(3);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({
      remoteName: "remote1",
      documentId: "doc1",
      error: "Network error",
    });
  });

  it("fast path: already completed job returns immediately", async () => {
    const jobId = "test-job-3";

    const event: SyncSucceededEvent = {
      jobId,
      syncOperationCount: 5,
    };
    await eventBus.emit(SyncEventTypes.SYNC_SUCCEEDED, event);

    const result = await awaiter.waitForSync(jobId);
    expect(result.jobId).toBe(jobId);
    expect(result.status).toBe("succeeded");
    expect(result.syncOperationCount).toBe(5);
  });

  it("multiple waiters for same jobId all resolve", async () => {
    const jobId = "test-job-4";

    const promise1 = awaiter.waitForSync(jobId);
    const promise2 = awaiter.waitForSync(jobId);

    const event: SyncSucceededEvent = {
      jobId,
      syncOperationCount: 2,
    };
    await eventBus.emit(SyncEventTypes.SYNC_SUCCEEDED, event);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1.jobId).toBe(jobId);
    expect(result1.status).toBe("succeeded");
    expect(result2.jobId).toBe(jobId);
    expect(result2.status).toBe("succeeded");
  });

  it("AbortSignal cancellation rejects the promise", async () => {
    const jobId = "test-job-5";
    const controller = new AbortController();

    const promise = awaiter.waitForSync(jobId, controller.signal);

    controller.abort();

    await expect(promise).rejects.toThrow("Operation aborted");
  });

  it("already aborted signal rejects immediately", async () => {
    const jobId = "test-job-6";
    const controller = new AbortController();
    controller.abort();

    await expect(awaiter.waitForSync(jobId, controller.signal)).rejects.toThrow(
      "Operation aborted",
    );
  });

  it("ignores events for other jobIds", async () => {
    const jobIdA = "test-job-A";
    const jobIdB = "test-job-B";

    const promiseA = awaiter.waitForSync(jobIdA);

    const eventB: SyncSucceededEvent = {
      jobId: jobIdB,
      syncOperationCount: 1,
    };
    await eventBus.emit(SyncEventTypes.SYNC_SUCCEEDED, eventB);

    let resolved = false;
    void promiseA.then(() => {
      resolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resolved).toBe(false);

    const eventA: SyncSucceededEvent = {
      jobId: jobIdA,
      syncOperationCount: 1,
    };
    await eventBus.emit(SyncEventTypes.SYNC_SUCCEEDED, eventA);

    const result = await promiseA;
    expect(result.jobId).toBe(jobIdA);
  });

  it("shutdown rejects pending waiters", async () => {
    const jobId = "test-job-7";

    const promise = awaiter.waitForSync(jobId);

    awaiter.shutdown();

    await expect(promise).rejects.toThrow("SyncAwaiter shutdown");
  });

  it("waitForSync after shutdown rejects immediately", async () => {
    const jobId = "test-job-8";

    awaiter.shutdown();

    await expect(awaiter.waitForSync(jobId)).rejects.toThrow(
      "SyncAwaiter is shutdown",
    );
  });

  it("aborted waiter does not prevent other waiters from resolving", async () => {
    const jobId = "test-job-9";
    const controller = new AbortController();

    const promise1 = awaiter.waitForSync(jobId, controller.signal);
    const promise2 = awaiter.waitForSync(jobId);

    controller.abort();

    await expect(promise1).rejects.toThrow("Operation aborted");

    const event: SyncSucceededEvent = {
      jobId,
      syncOperationCount: 1,
    };
    await eventBus.emit(SyncEventTypes.SYNC_SUCCEEDED, event);

    const result2 = await promise2;
    expect(result2.jobId).toBe(jobId);
    expect(result2.status).toBe("succeeded");
  });
});
