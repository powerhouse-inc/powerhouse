// A runtime shut down after losing the workflow singleton sits on a reactor
// that keeps serving. Nothing may run after it, and nothing it adopted may be
// left PENDING for the next owner to mistake for a fire already handled.
import { afterEach, describe, expect, it, vi } from "vitest";
import { effectiveRunPolicy } from "./policy.js";
import { REACTOR_PIECE } from "./reactor-piece.js";
import type { WorkflowRunGate } from "./run-gate.js";
import type { WorkflowRuntimeService } from "./service.js";
import { WorkflowRunStore } from "./store.js";
import { testRuntime } from "../../test/helpers/runtime.js";

const WORKFLOW_TYPE = "powerhouse/workflow";
const policy = { concurrency: "QUEUE", onFailure: "IGNORE" };
const state = {
  name: "Queued watcher",
  status: "ENABLED",
  version: 1,
  policy,
  trigger: {
    id: "t1",
    pieceName: REACTOR_PIECE,
    pieceVersion: "1.0.0",
    triggerName: "document-event",
    config: { documentType: "powerhouse/note", actionType: "SET_TITLE" },
  },
  steps: [],
  edges: [],
  variables: [],
};

let seq = 0;
let service: WorkflowRuntimeService | undefined;

function runtime(): { service: WorkflowRuntimeService; workflowId: string } {
  seq += 1;
  const workflowId = `wf-shutdown-${seq}`;
  service = testRuntime({
    reactorClient: {
      find: () => Promise.resolve({ results: [] }),
      get: (id: string) =>
        Promise.resolve({
          header: { id, documentType: WORKFLOW_TYPE, name: id },
          state: { global: state },
        }),
    },
  } as never);
  return { service, workflowId };
}

const gateOf = (runtimeService: WorkflowRuntimeService) =>
  (runtimeService as unknown as { runGate: WorkflowRunGate }).runGate;

const within = <T>(promise: Promise<T>, ms = 2_000) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`still pending after ${ms}ms`)), ms),
    ),
  ]);

afterEach(() => {
  service?.shutdown();
  service = undefined;
  vi.restoreAllMocks();
});

describe("a runtime that has shut down", () => {
  it("fails the PENDING row a trigger handed it instead of leaving it", async () => {
    const { service, workflowId } = runtime();
    const store = (await service.store())!;
    const runId = await store.enqueueRun({
      workflowId,
      triggerKind: "document-event",
      triggerPayload: { documentId: "doc-1" },
    });
    service.shutdown();

    await expect(
      service.fire(
        workflowId,
        {},
        "document-event",
        undefined,
        undefined,
        runId,
      ),
    ).rejects.toThrow("shut down");

    expect((await store.getRun(runId))?.status).toBe("FAILED");
  });

  it("refuses a firing that was waiting for its slot", async () => {
    const { service, workflowId } = runtime();
    const store = (await service.store())!;
    const slot = await gateOf(service).admit(
      workflowId,
      effectiveRunPolicy({ policy } as never),
    );
    const runId = await store.enqueueRun({
      workflowId,
      triggerKind: "document-event",
    });
    const firing = service.fire(
      workflowId,
      {},
      "document-event",
      undefined,
      undefined,
      runId,
    );
    await vi.waitFor(() => expect(gateOf(service).waiting(workflowId)).toBe(1));

    service.shutdown();

    await expect(within(firing)).rejects.toThrow("shut down");
    expect((await store.getRun(runId))?.status).toBe("FAILED");
    if (slot.admitted) slot.release();
  });

  it("refuses a firing handed its slot as the runtime shut down", async () => {
    const { service, workflowId } = runtime();
    const store = (await service.store())!;
    const slot = await gateOf(service).admit(
      workflowId,
      effectiveRunPolicy({ policy } as never),
    );
    const runId = await store.enqueueRun({
      workflowId,
      triggerKind: "document-event",
    });
    const firing = service.fire(
      workflowId,
      {},
      "document-event",
      undefined,
      undefined,
      runId,
    );
    await vi.waitFor(() => expect(gateOf(service).waiting(workflowId)).toBe(1));

    if (slot.admitted) slot.release();
    service.shutdown();

    await expect(within(firing)).rejects.toThrow("shut down");
    expect((await store.getRun(runId))?.status).toBe("FAILED");
  });

  // Opening the journal runs its sweeps, which would fail the next owner's
  // live runs.
  it("does not reopen a journal that failed to open", async () => {
    const create = vi
      .spyOn(WorkflowRunStore, "create")
      .mockRejectedValueOnce(new Error("database restarting"));
    const { service } = runtime();
    expect(await service.store()).toBeUndefined();
    (service as unknown as { storeReopenAt: number }).storeReopenAt = 0;

    service.shutdown();

    expect(await service.store()).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
