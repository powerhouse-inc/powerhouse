// The read model's cursor advances the moment onOperations resolves, so every
// fire it matched has to be a row by then. These cover the row, its adoption
// by the run that follows, and what closes it out when that run never starts.
import type { OperationWithContext } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_EVENT_BLOCK } from "./reactor-piece.js";
import type { WorkflowRuntimeService } from "./service.js";
import { testRuntime } from "../../test/helpers/runtime.js";

// The PGlite database is shared by every suite in this file, so each test
// watches under its own workflow id and reads back only its own runs.
let watcherSeq = 0;
let WATCHER = "";
const SUBJECT = "doc-subject";
const WORKFLOW_TYPE = "powerhouse/workflow";

const watcherState = {
  name: "Durable watcher",
  status: "ENABLED",
  version: 3,
  trigger: {
    id: "t1",
    blockType: DOCUMENT_EVENT_BLOCK,
    config: { documentType: "powerhouse/note", actionType: "SET_TITLE" },
  },
  steps: [],
  edges: [],
  variables: [],
};

let ordinal = 0;

function op(
  documentId: string,
  documentType: string,
  actionType: string,
  input: unknown,
  resultingState?: unknown,
): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: actionType, input },
      resultingState: resultingState
        ? JSON.stringify(resultingState)
        : undefined,
    },
    context: {
      documentId,
      documentType,
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

function runtimeFor(workflowId: string): WorkflowRuntimeService {
  return testRuntime({
    reactorClient: {
      find: () => Promise.resolve({ results: [] }),
      get: (id: string) =>
        Promise.resolve({
          header: { id, documentType: WORKFLOW_TYPE },
          state: { global: { ...watcherState, name: `doc ${workflowId}` } },
        }),
    },
  } as never);
}

async function runsFor(
  service: WorkflowRuntimeService,
  workflowId: string,
): Promise<{ id: string; status: string; trigger_payload: string | null }[]> {
  const store = await service.store();
  return (await store!.listRuns(workflowId)) as never;
}

describe("onOperations journals a matched fire before it returns", () => {
  let service: WorkflowRuntimeService;
  let fireArgs: unknown[][];

  beforeEach(async () => {
    watcherSeq += 1;
    WATCHER = `wf-enqueue-watcher-${watcherSeq}`;
    service = runtimeFor(WATCHER);
    fireArgs = [];
    // Never resolves: anything observable after onOperations returns was
    // written by onOperations itself, not by the run it started.
    vi.spyOn(service, "fire").mockImplementation((...args: unknown[]) => {
      fireArgs.push(args);
      return new Promise(() => undefined) as never;
    });
    await service.onOperations([
      op(WATCHER, WORKFLOW_TYPE, "SET_WORKFLOW_NAME", {}, watcherState),
    ]);
  });

  it("leaves a PENDING run carrying the trigger payload", async () => {
    await service.onOperations([
      op(SUBJECT, "powerhouse/note", "SET_TITLE", { title: "hi" }),
    ]);

    const runs = await runsFor(service, WATCHER);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("PENDING");
    expect(JSON.parse(runs[0].trigger_payload!)).toMatchObject({
      documentId: SUBJECT,
      action: { type: "SET_TITLE", input: { title: "hi" } },
    });
  });

  it("hands that run's id to the fire it starts", async () => {
    await service.onOperations([
      op(SUBJECT, "powerhouse/note", "SET_TITLE", { title: "hi" }),
    ]);

    const runs = await runsFor(service, WATCHER);
    expect(fireArgs).toHaveLength(1);
    // (workflowId, payload, kind, resume, ctx, enqueuedRunId)
    expect(fireArgs[0][0]).toBe(WATCHER);
    expect(fireArgs[0][2]).toBe("document-event");
    expect(fireArgs[0][5]).toBe(runs[0].id);
  });

  it("journals one run when the same operation is delivered twice", async () => {
    const replayed = op(SUBJECT, "powerhouse/note", "SET_TITLE", {
      title: "hi",
    });
    await service.onOperations([replayed]);
    // What a restart loses is the in-memory seen-set; the read model's cursor
    // can trail the run it already wrote, so the batch arrives again.
    (service as unknown as { seenOps: Set<string> }).seenOps.clear();

    await service.onOperations([replayed]);

    const runs = await runsFor(service, WATCHER);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("PENDING");
    expect(fireArgs).toHaveLength(1);
  });

  it("writes no row for an operation no trigger matches", async () => {
    await service.onOperations([
      op(SUBJECT, "powerhouse/note", "SET_BODY", { body: "x" }),
    ]);
    expect(await runsFor(service, WATCHER)).toHaveLength(0);
  });

  it("still sees a registry edit made earlier in the same batch", async () => {
    const enabling = {
      ...watcherState,
      trigger: {
        ...watcherState.trigger,
        config: { documentType: "powerhouse/note", actionType: "SET_BODY" },
      },
    };
    // One batch: the edit widens the filter, the next operation matches it.
    await service.onOperations([
      op(WATCHER, WORKFLOW_TYPE, "SET_TRIGGER", {}, enabling),
      op(SUBJECT, "powerhouse/note", "SET_BODY", { body: "x" }),
    ]);

    const runs = await runsFor(service, WATCHER);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("PENDING");
  });
});

describe("fire() adopts an enqueued run", () => {
  const ADOPTED = "wf-adopted";

  it("turns the row RUNNING and closes it out under the same id", async () => {
    const service = runtimeFor(ADOPTED);
    (service as unknown as Record<string, unknown>).executor = {
      execute: () => Promise.resolve({ output: {} }),
    };
    const store = (await service.store())!;
    const runId = await store.enqueueRun({
      workflowId: ADOPTED,
      triggerKind: "document-event",
      triggerPayload: { v: 1 },
    });

    const result = await service.fire(
      ADOPTED,
      { v: 1 },
      "document-event",
      undefined,
      undefined,
      runId,
    );

    expect(result.runId).toBe(runId);
    const run = await store.getRun(runId);
    expect(run?.status).toBe("SUCCEEDED");
    // beginRun fills in what only the document could say.
    expect(run?.workflow_version).toBe(3);
    expect(run?.workflow_name).toBe(`doc ${ADOPTED}`);
    // One row, not two: startRun never ran.
    expect(await store.listRuns(ADOPTED)).toHaveLength(1);
  });

  it("fails the row when the workflow refuses to fire", async () => {
    const service = testRuntime({
      reactorClient: {
        find: () => Promise.resolve({ results: [] }),
        get: (id: string) =>
          Promise.resolve({
            header: { id, documentType: WORKFLOW_TYPE },
            state: { global: { ...watcherState, status: "DISABLED" } },
          }),
      },
    } as never);
    const store = (await service.store())!;
    const runId = await store.enqueueRun({
      workflowId: "wf-refused",
      triggerKind: "document-event",
      triggerPayload: { v: 1 },
    });

    await expect(
      service.fire(
        "wf-refused",
        { v: 1 },
        "document-event",
        undefined,
        undefined,
        runId,
      ),
    ).rejects.toThrow(/only ENABLED/);

    const run = await store.getRun(runId);
    expect(run?.status).toBe("FAILED");
    expect(run?.ended_at).not.toBeNull();
  });
});
