import { describe, expect, it } from "vitest";
import { StorageHealthTracker } from "../../src/storage/storage-health.js";

describe("StorageHealthTracker", () => {
  it("reads unhealthy from the first poison report", () => {
    const tracker = new StorageHealthTracker();
    expect(tracker.getStorageHealth()).toEqual({ healthy: true });
    tracker.markPoisoned();
    expect(tracker.getStorageHealth()).toEqual({ healthy: false });
  });
});
