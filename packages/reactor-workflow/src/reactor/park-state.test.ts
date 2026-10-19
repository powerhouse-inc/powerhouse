import { describe, expect, it } from "vitest";
import { ParkState } from "./park-state.js";
import type { WorkflowParkRow } from "./store.js";

function park(workflowId: string, version: number): WorkflowParkRow {
  return {
    workflow_id: workflowId,
    published_version: version,
    reason: "failed",
    parked_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("ParkState", () => {
  it("seeds from the store on the first read", async () => {
    const state = new ParkState(() => Promise.resolve([park("wf-a", 2)]));
    expect(state.known("wf-a")).toBeUndefined();

    expect((await state.get("wf-a"))?.published_version).toBe(2);
    expect(state.known("wf-a")?.park?.published_version).toBe(2);
    expect(state.known("wf-b")).toEqual({ park: undefined });
  });

  it("keeps what was queued while the seed was loading", async () => {
    let finish!: (rows: WorkflowParkRow[]) => void;
    const loading = new Promise<WorkflowParkRow[]>((resolve) => {
      finish = resolve;
    });
    const state = new ParkState(() => loading);
    const read = state.get("wf-a");
    state.delete("wf-a");
    state.set(park("wf-b", 3));
    finish([park("wf-a", 1), park("wf-b", 1), park("wf-c", 1)]);

    expect(await read).toBeUndefined();
    expect((await state.get("wf-b"))?.published_version).toBe(3);
    expect((await state.get("wf-c"))?.published_version).toBe(1);
  });

  it("loads again after a load that failed", async () => {
    let calls = 0;
    const state = new ParkState(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("the journal is gone"))
        : Promise.resolve([park("wf-a", 1)]);
    });

    await expect(state.get("wf-a")).rejects.toThrow("the journal is gone");
    expect((await state.get("wf-a"))?.published_version).toBe(1);
    expect(calls).toBe(2);
  });
});
