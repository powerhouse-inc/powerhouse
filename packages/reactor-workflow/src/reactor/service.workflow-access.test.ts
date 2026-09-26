// A workflow's own data — its endpoint URL, its trigger state, its run journal
// — is served to the caller it belongs to, or not served at all.
import type { WorkflowRuntimeHostDeps } from "./host.js";
import type { WorkflowRuntimeService } from "./service.js";
import { describe, expect, it, vi } from "vitest";
import { testRuntime } from "../../test/helpers/runtime.js";

const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;
const MINE = "wf-mine";
const THEIRS = "wf-theirs";
const DRIVE = "drive-mine";

const READABLE = new Set([MINE, DRIVE]);

const assertCanRead = vi.fn((documentId: string) =>
  READABLE.has(documentId)
    ? Promise.resolve({})
    : Promise.reject(new Error("forbidden")),
);

function runRow(id: string, workflowId: string) {
  return {
    id,
    workflow_id: workflowId,
    workflow_name: "Run",
    workflow_version: 1,
    trigger_kind: "manual",
    trigger_payload: null,
    status: "FAILED",
    error: null,
    started_at: "2026-01-01T00:00:00.000Z",
    ended_at: null,
    rerun_of: null,
  };
}

const rows = [runRow("run-mine", MINE), runRow("run-theirs", THEIRS)];

const store = {
  listTriggerStates: () =>
    Promise.resolve([
      { workflow_id: MINE, block_type: "core#webhook" },
      { workflow_id: THEIRS, block_type: "core#webhook" },
    ]),
  listRuns: () => Promise.resolve(rows),
  getRun: (id: string) => Promise.resolve(rows.find((row) => row.id === id)),
  getSteps: () => Promise.resolve([]),
  getRunDocuments: () => Promise.resolve([]),
};

function serviceWith(
  deps: Partial<WorkflowRuntimeHostDeps> = {},
): WorkflowRuntimeService {
  const service = testRuntime({
    reactorClient: { get: () => Promise.reject(new Error("not used")) },
    assertCanRead,
    ...deps,
  } as never);
  (service as unknown as { storePromise: unknown }).storePromise =
    Promise.resolve(store);
  return service;
}

describe("workflow access", () => {
  it("mints a webhook endpoint only for a workflow the caller can read", async () => {
    const service = serviceWith();

    await expect(service.webhookEndpoint(THEIRS, CTX)).rejects.toThrow(
      "forbidden",
    );
    await expect(service.webhookEndpoint(MINE)).rejects.toThrow(
      "authenticated request",
    );
    // Readable: the check passes and the answer is the host's (no webhooks).
    expect(await service.webhookEndpoint(MINE, CTX)).toBeNull();
  });

  it("refuses a manual fire the caller could not have authored", async () => {
    const service = serviceWith();

    await expect(
      service.fire(THEIRS, undefined, "manual", undefined, CTX),
    ).rejects.toThrow("forbidden");
    await expect(service.fire(MINE)).rejects.toThrow("authenticated request");
  });

  it("refuses to replay a run whose workflow is off limits", async () => {
    const service = serviceWith();
    const fire = vi.spyOn(service, "fire");

    await expect(service.rerun("run-theirs", CTX)).rejects.toThrow("forbidden");
    expect(fire).not.toHaveBeenCalled();
  });

  it("keeps trigger states to the workflows the caller may read", async () => {
    const service = serviceWith();

    expect((await service.triggerStates(CTX)).map((row) => row.workflow_id)) //
      .toEqual([MINE]);
    expect(await service.triggerStates()).toEqual([]);
  });

  it("keeps the run journal to the workflows the caller may read", async () => {
    const service = serviceWith();

    const listed = await service.runs({}, CTX);
    expect(listed.map((record) => record.row.id)).toEqual(["run-mine"]);
    // An unscoped listing is every workflow in the reactor: without a caller
    // there is nothing to scope it to.
    expect(await service.runs({})).toEqual([]);
    await expect(service.runs({ workflowId: THEIRS }, CTX)).rejects.toThrow(
      "forbidden",
    );
  });

  it("answers for a run of another workflow as it answers for no run", async () => {
    const service = serviceWith();

    expect(await service.run("run-theirs", CTX)).toBeNull();
    expect(await service.run("run-mine")).toBeNull();
    expect((await service.run("run-mine", CTX))?.row.id).toBe("run-mine");
  });

  it("drains every page of a drive's nodes, keeping the readable ones", async () => {
    const node = (id: string) => ({
      id,
      kind: "file",
      documentType: "powerhouse/workflow",
    });
    const listNodes = vi.fn(() =>
      Promise.resolve({
        results: [node(MINE)],
        next: () => Promise.resolve({ results: [node(THEIRS)] }),
      }),
    );
    const service = serviceWith({
      reactorClient: { drives: { listNodes } },
    } as never);

    expect(await service.driveWorkflowIds(DRIVE, CTX)).toEqual([MINE]);
    await expect(service.driveWorkflowIds(DRIVE)).rejects.toThrow(
      "authenticated request",
    );
  });
});
