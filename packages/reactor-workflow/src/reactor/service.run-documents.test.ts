// A run is served only to a caller who is served every live document its
// trigger names, and connections are read as the caller.
import type { WorkflowRuntimeHostDeps } from "./host.js";
import type { WorkflowRuntimeService } from "./service.js";
import { describe, expect, it, vi } from "vitest";
import { testRuntime } from "../../test/helpers/runtime.js";

const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;
const WORKFLOW = "wf-mine";
const OPEN = "doc-open";
const SECRET = "doc-secret";
const GONE = "doc-gone";

const READABLE = new Set([WORKFLOW, OPEN]);

const assertCanRead = vi.fn((documentId: string) =>
  READABLE.has(documentId)
    ? Promise.resolve({})
    : Promise.reject(new Error("forbidden")),
);

function absent(name: string) {
  const error = new Error("absent");
  error.name = name;
  return error;
}

// A document the caller is refused but that is still live, and one deleted.
const get = vi.fn((documentId: string) =>
  documentId === GONE
    ? Promise.reject(absent("DocumentDeletedError"))
    : Promise.resolve({ header: { id: documentId } }),
);

function runRow(id: string, payload: unknown) {
  return {
    id,
    workflow_id: WORKFLOW,
    workflow_name: "Run",
    workflow_version: 1,
    trigger_kind: "document-event",
    trigger_payload: payload === null ? null : JSON.stringify(payload),
    status: "FAILED",
    error: null,
    started_at: "2026-01-01T00:00:00.000Z",
    ended_at: null,
    rerun_of: null,
  };
}

const rows = [
  runRow("run-manual", null),
  runRow("run-open", { documentId: OPEN }),
  runRow("run-secret", { documentId: SECRET }),
  runRow("run-secret-drive", { documentId: OPEN, driveId: SECRET }),
  runRow("run-gone", { documentId: GONE }),
];

const store = {
  listRuns: () => Promise.resolve(rows),
  getRun: (id: string) => Promise.resolve(rows.find((row) => row.id === id)),
  getSteps: () => Promise.resolve([]),
};

function serviceWith(
  deps: Partial<WorkflowRuntimeHostDeps> = {},
): WorkflowRuntimeService {
  const service = testRuntime({
    reactorClient: { get },
    assertCanRead,
    ...deps,
  } as never);
  (service as unknown as { storePromise: unknown }).storePromise =
    Promise.resolve(store);
  return service;
}

describe("runs are served with the documents their trigger names", () => {
  it("lists only runs whose every live trigger document the caller may read", async () => {
    const service = serviceWith();

    const listed = await service.runs({ workflowId: WORKFLOW }, CTX);

    expect(listed.map((record) => record.row.id)).toEqual([
      "run-manual",
      "run-open",
      "run-gone",
    ]);
  });

  it("answers for a withheld run as for no run", async () => {
    const service = serviceWith();

    expect(await service.run("run-secret", CTX)).toBeNull();
    expect(await service.run("run-secret-drive", CTX)).toBeNull();
    expect((await service.run("run-open", CTX))?.row.id).toBe("run-open");
  });

  it("refuses to replay a withheld run", async () => {
    const service = serviceWith();
    const fire = vi.spyOn(service, "fire");

    await expect(service.rerun("run-secret", CTX)).rejects.toThrow(
      'Run "run-secret" not found',
    );
    expect(fire).not.toHaveBeenCalled();
  });

  it("withholds a run whose trigger document cannot be checked", async () => {
    const service = serviceWith({
      reactorClient: {
        get: () => Promise.reject(new Error("read side down")),
      },
    } as never);

    expect(await service.run("run-gone", CTX)).toBeNull();
  });
});

describe("connections", () => {
  it("are read as the caller and need a readable global scope", async () => {
    const connection = (id: string, global: unknown) => ({
      header: { id },
      state: global === undefined ? {} : { global },
    });
    const find = vi.fn(() =>
      Promise.resolve({
        results: [
          connection(OPEN, {
            name: "c",
            connectorId: "x",
            authType: "NONE",
            status: "ACTIVE",
          }),
          connection(WORKFLOW, undefined),
        ],
      }),
    );
    const subject = { address: "0xabc" };
    const service = serviceWith({
      reactorClient: { find },
      subjectOf: () => subject,
    } as never);

    const listed = await service.connections(CTX);

    expect(find).toHaveBeenCalledWith(
      { type: "powerhouse/connection" },
      { subject },
    );
    expect(listed.map((c) => c.id)).toEqual([OPEN]);
  });
});
