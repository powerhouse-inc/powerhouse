// `policy.concurrency` and `policy.onFailure`, enforced in the service: both
// were document-model fields nothing read (backlog item 4, W3.3).
import {
  actions,
  type WorkflowDocument,
} from "@powerhousedao/workflow/document-models/workflow";
import type { OperationWithContext } from "document-model";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Documents } from "../../test/helpers/documents.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { packagePieces } from "./piece-registry.js";
import { PARKED_TRIGGER_STATUS } from "./policy.js";
import type { WorkflowRunGate } from "./run-gate.js";
import type { WorkflowRuntimeService } from "./service.js";
import { WorkflowRunStore } from "./store.js";
import { CORE_PIECE_NAME, CORE_PIECE_VERSION } from "../pieces/index.js";
import { REACTOR_PIECE } from "./reactor-piece.js";

const PIECE = "@acme/piece-policy";
const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

// `slow` records when it entered and left, so a suite can see whether two runs
// of one workflow overlapped. `boom` always fails.
const FIXTURE = `
const marks = [];
export const policy = {
  displayName: "Policy",
  actions: {
    slow: {
      name: "slow",
      displayName: "Slow",
      props: { tag: { displayName: "Tag", type: "SHORT_TEXT", required: false } },
      run: async (ctx) => {
        const tag = ctx.propsValue.tag ?? "";
        marks.push("in:" + tag);
        await new Promise((resolve) => setTimeout(resolve, 150));
        marks.push("out:" + tag);
        return { marks: [...marks] };
      },
    },
    boom: {
      name: "boom",
      displayName: "Boom",
      props: {},
      run: async () => { throw new Error("always fails"); },
    },
  },
  triggers: {},
};
`;

let dir = "";
let documents: Documents;
let service: WorkflowRuntimeService;

interface WorkflowOptions {
  action: "slow" | "boom";
  policy?: Record<string, unknown>;
}

function workflow(id: string, options: WorkflowOptions) {
  documents.apply(
    id,
    actions.setTrigger({
      id: "t1",
      pieceName: "@powerhousedao/piece-core",
      pieceVersion: CORE_PIECE_VERSION,
      triggerName: "manual",
      config: {},
    }),
    actions.addStep({
      id: "a",
      key: "only",
      name: "Only",
      pieceName: PIECE,
      pieceVersion: "1.0.0",
      actionName: options.action,
      config: options.action === "slow" ? { tag: id } : {},
    }),
    actions.addEdge({ id: "e1", from: "t1", to: "a", port: "next" }),
    ...(options.policy ? [actions.setPolicy(options.policy as never)] : []),
    actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
    actions.setWorkflowStatus({ status: "ENABLED" }),
  );
}

// A workflow edit as the read model delivers it, so a suite can arm a trigger
// the way the reactor does rather than by writing the row itself.
let ordinal = 0;
function workflowOp(id: string, document: WorkflowDocument) {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "EDIT", input: {} },
      resultingState: JSON.stringify(document.state.global),
    },
    context: {
      documentId: id,
      documentType: "powerhouse/workflow",
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "rw-policy-"));
  const entryPath = join(dir, "index.mjs");
  await writeFile(entryPath, FIXTURE);
  packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
  documents = new Documents();
  service = testRuntime({ reactorClient: documents.client() as never });
});

afterAll(async () => {
  service.shutdown();
  packagePieces.reset();
  await rm(dir, { recursive: true, force: true });
});

describe("policy.concurrency", () => {
  it("serialises two runs of one workflow under QUEUE", async () => {
    workflow("wf-queue", {
      action: "slow",
      policy: { concurrency: "QUEUE", onFailure: "IGNORE" },
    });

    const [first, second] = await Promise.all([
      service.fire("wf-queue", undefined, "manual", undefined, CTX),
      service.fire("wf-queue", undefined, "manual", undefined, CTX),
    ]);

    expect(first.status).toBe("SUCCEEDED");
    expect(second.status).toBe("SUCCEEDED");
    // The piece's module-level marks survive within a worker, but each run
    // gets its own child, so overlap is read from the runs' own timings.
    const runs = await service.runs({ workflowId: "wf-queue" }, CTX);
    const spans = runs
      .filter((run) => run.row.status === "SUCCEEDED")
      .map((run) => [
        Date.parse(run.row.started_at),
        Date.parse(run.row.ended_at ?? run.row.started_at),
      ]);
    expect(spans).toHaveLength(2);
    const [earlier, later] = spans.sort((a, b) => a[0] - b[0]);
    // The second run did not start until the first had finished.
    expect(later[0]).toBeGreaterThanOrEqual(earlier[1] - 5);
  });

  it("skips the second firing under SINGLETON and journals it CANCELLED", async () => {
    workflow("wf-singleton", {
      action: "slow",
      policy: { concurrency: "SINGLETON", onFailure: "IGNORE" },
    });

    const [first, second] = await Promise.all([
      service.fire("wf-singleton", undefined, "manual", undefined, CTX),
      service.fire("wf-singleton", undefined, "manual", undefined, CTX),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["CANCELLED", "SUCCEEDED"]);
    const skipped = [first, second].find((run) => run.status === "CANCELLED")!;
    // Journaled, not dropped: a firing that vanished looks exactly like a
    // trigger that never fired.
    expect(skipped.runId).not.toBeNull();
    const rows = await service.runs({ workflowId: "wf-singleton" }, CTX);
    const row = rows.find((run) => run.row.id === skipped.runId)!.row;
    expect(row.status).toBe("CANCELLED");
    expect(row.error).toContain("SINGLETON");
  });

  it("runs both at once under PARALLEL", async () => {
    workflow("wf-parallel", {
      action: "slow",
      policy: { concurrency: "PARALLEL", onFailure: "IGNORE" },
    });

    await Promise.all([
      service.fire("wf-parallel", undefined, "manual", undefined, CTX),
      service.fire("wf-parallel", undefined, "manual", undefined, CTX),
    ]);

    const spans = (await service.runs({ workflowId: "wf-parallel" }, CTX))
      .filter((run) => run.row.status === "SUCCEEDED")
      .map((run) => [
        Date.parse(run.row.started_at),
        Date.parse(run.row.ended_at ?? run.row.started_at),
      ])
      .sort((a, b) => a[0] - b[0]);
    expect(spans).toHaveLength(2);
    // Overlapping: the later run started before the earlier one ended.
    expect(spans[1][0]).toBeLessThan(spans[0][1]);
  });

  // The deadline used to be computed AFTER admission, so queue time was free:
  // a firing could wait out a whole shift under a one-second timeout and then
  // run its side effect anyway, with its full budget intact.
  it("cancels a firing that waited past its runTimeoutSeconds", async () => {
    // `slow` sleeps 150ms, so a queued second firing waits at least that long
    // for its slot — a tenth of a second is gone before it is ever admitted.
    workflow("wf-queue-expired", {
      action: "slow",
      policy: {
        concurrency: "QUEUE",
        onFailure: "IGNORE",
        runTimeoutSeconds: 0.1,
      },
    });

    const fired = await Promise.all([
      service.fire("wf-queue-expired", undefined, "manual", undefined, CTX),
      service.fire("wf-queue-expired", undefined, "manual", undefined, CTX),
    ]);

    expect(fired.map((run) => run.status)).toContain("CANCELLED");
    const rows = await service.runs({ workflowId: "wf-queue-expired" }, CTX);
    // The firing that waited the first one out had nothing left to run in, so
    // it is journaled CANCELLED naming the wait rather than running late.
    const waited = rows.find((run) =>
      run.row.error?.includes("waited past its runTimeoutSeconds"),
    );
    expect(waited).toBeDefined();
    expect(waited!.row.status).toBe("CANCELLED");
    // Not a step of it executed: a side effect fired long after the timeout
    // that was supposed to bound it is the thing being prevented.
    expect(
      await (await service.store())!.getSteps(waited!.row.id),
    ).toHaveLength(0);
  }, 60_000);

  // A throw between admit() and the try whose finally releases would leak the
  // slot for the life of the process: SINGLETON would refuse every later
  // firing of this workflow, and nothing would ever free it.
  it("releases the slot when the run journal throws on the way in", async () => {
    workflow("wf-gate-leak", {
      action: "slow",
      policy: { concurrency: "SINGLETON", onFailure: "IGNORE" },
    });
    const gate = (service as unknown as { runGate: WorkflowRunGate }).runGate;
    const startRun = vi
      .spyOn(WorkflowRunStore.prototype, "startRun")
      .mockRejectedValueOnce(new Error("the journal is gone"));

    await expect(
      service.fire("wf-gate-leak", undefined, "manual", undefined, CTX),
    ).rejects.toThrow("the journal is gone");
    startRun.mockRestore();

    expect(gate.active("wf-gate-leak")).toBe(0);
    // And the workflow is not wedged: the next firing runs instead of being
    // refused by a slot the failed one never gave back.
    const next = await service.fire(
      "wf-gate-leak",
      undefined,
      "manual",
      undefined,
      CTX,
    );
    expect(next.status).toBe("SUCCEEDED");
  });
});

describe("policy.onFailure", () => {
  it("parks the trigger on PARK, so the schedule stops refiring", async () => {
    workflow("wf-park", { action: "boom", policy: { onFailure: "PARK" } });
    const store = await service.store();
    await store!.upsertTriggerState({
      workflow_id: "wf-park",
      piece_name: "@powerhousedao/piece-core",
      trigger_name: "schedule",
      config_hash: "h",
      status: "ENABLED",
      store_state: "{}",
      interval_ms: 1000,
      next_poll_at: "2020-01-01T00:00:00.000Z",
      last_poll_at: null,
      last_error: null,
      consecutive_failures: 0,
      lease_owner: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    });

    const run = await service.fire("wf-park", undefined, "schedule");

    expect(run.status).toBe("FAILED");
    const row = await store!.getTriggerState("wf-park");
    expect(row?.status).toBe(PARKED_TRIGGER_STATUS);
    expect(row?.last_error).toContain("onFailure = PARK");
    // The supervisor's due query only returns ENABLED rows, so a parked
    // trigger is not due however overdue its next_poll_at is.
    const due = await store!.listDueTriggerStates(new Date().toISOString());
    expect(due.map((entry) => entry.workflow_id)).not.toContain("wf-park");
  });

  // Park is a runtime override of the document's enabled-ness: the document
  // still says ENABLED, so re-arming from it — which is what every restart
  // does — must not resurrect the trigger PARK took out of service.
  it("keeps a parked trigger parked across a restart", async () => {
    const schedule = { mode: "cron", cron: "0 * * * *" };
    const document = documents.apply(
      "wf-park-restart",
      actions.setTrigger({
        id: "t1",
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "schedule",
        config: schedule,
      }),
      actions.addStep({
        id: "a",
        key: "only",
        name: "Only",
        pieceName: PIECE,
        pieceVersion: "1.0.0",
        actionName: "boom",
        config: {},
      }),
      actions.addEdge({ id: "e1", from: "t1", to: "a", port: "next" }),
      actions.setPolicy({ onFailure: "PARK" } as never),
      actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
    await service.onOperations([workflowOp("wf-park-restart", document)]);
    const store = (await service.store())!;
    await vi.waitFor(async () =>
      expect((await store.getTriggerState("wf-park-restart"))?.status).toBe(
        "ENABLED",
      ),
    );

    // A terminal failure under PARK takes it out of the ENABLED set.
    const run = await service.fire("wf-park-restart", undefined, "schedule");
    expect(run.status).toBe("FAILED");
    const parked = await store.getTriggerState("wf-park-restart");
    expect(parked?.status).toBe(PARKED_TRIGGER_STATUS);

    // The restart: a new runtime over the same journal, re-arming the very
    // same ENABLED document. Nothing in memory remembers the park.
    const rebooted = testRuntime({
      reactorClient: documents.client() as never,
    });
    const upsert = vi.spyOn(rebooted.supervisor(), "upsert");
    await rebooted.onOperations([workflowOp("wf-park-restart", document)]);
    await vi.waitFor(() => expect(upsert).toHaveBeenCalled());
    // The arming the service does not await, awaited: the park either holds
    // through a completed re-arm or it does not hold at all.
    await Promise.all(
      upsert.mock.results.map((result) => result.value as Promise<void>),
    );

    const after = await (await rebooted.store())!.getTriggerState(
      "wf-park-restart",
    );
    expect(after?.status).toBe(PARKED_TRIGGER_STATUS);
    expect(after?.last_error).toContain("onFailure = PARK");
    // And it is still not due, so the schedule does not fire it.
    const due = await store.listDueTriggerStates(
      new Date(Date.now() + 86_400_000).toISOString(),
    );
    expect(due.map((entry) => entry.workflow_id)).not.toContain(
      "wf-park-restart",
    );

    // The way out: a re-publish that changes the trigger arms it again.
    const republished = documents.apply(
      "wf-park-restart",
      actions.setTrigger({
        id: "t1",
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "schedule",
        config: { mode: "cron", cron: "0 0 * * *" },
      }),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );
    await rebooted.onOperations([workflowOp("wf-park-restart", republished)]);
    await vi.waitFor(async () =>
      expect((await store.getTriggerState("wf-park-restart"))?.status).toBe(
        "ENABLED",
      ),
    );
  }, 60_000);

  it("leaves the trigger alone on IGNORE", async () => {
    workflow("wf-ignore", { action: "boom", policy: { onFailure: "IGNORE" } });
    const store = await service.store();
    await store!.upsertTriggerState({
      workflow_id: "wf-ignore",
      piece_name: "@powerhousedao/piece-core",
      trigger_name: "schedule",
      config_hash: "h",
      status: "ENABLED",
      store_state: "{}",
      interval_ms: 1000,
      next_poll_at: "2020-01-01T00:00:00.000Z",
      last_poll_at: null,
      last_error: null,
      consecutive_failures: 0,
      lease_owner: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    });

    await service.fire("wf-ignore", undefined, "schedule");

    expect((await store!.getTriggerState("wf-ignore"))?.status).toBe("ENABLED");
  });

  it("leaves the trigger alone on NOTIFY, and says so", async () => {
    const logged: string[] = [];
    const notifying = testRuntime({
      reactorClient: documents.client() as never,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        debug: () => undefined,
        verbose: () => undefined,
        error: (message: string) => logged.push(message),
        child: () => notifying as never,
      } as never,
    });
    workflow("wf-notify", { action: "boom", policy: { onFailure: "NOTIFY" } });
    const store = await notifying.store();
    await store!.upsertTriggerState({
      workflow_id: "wf-notify",
      piece_name: "@powerhousedao/piece-core",
      trigger_name: "schedule",
      config_hash: "h",
      status: "ENABLED",
      store_state: "{}",
      interval_ms: 1000,
      next_poll_at: null,
      last_poll_at: null,
      last_error: null,
      consecutive_failures: 0,
      lease_owner: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    });

    await notifying.fire("wf-notify", undefined, "schedule");
    notifying.shutdown();

    expect((await store!.getTriggerState("wf-notify"))?.status).toBe("ENABLED");
    expect(logged.join("\n")).toContain("NOTIFY");
  });
});

function scheduleRow(workflowId: string) {
  return {
    workflow_id: workflowId,
    piece_name: "@powerhousedao/piece-core",
    trigger_name: "schedule",
    config_hash: "h",
    status: "ENABLED",
    store_state: "{}",
    interval_ms: 1000,
    next_poll_at: null,
    last_poll_at: null,
    last_error: null,
    consecutive_failures: 0,
    lease_owner: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  };
}

// onFailure is about the trigger: an operator's own run failing says nothing
// about whether the trigger should keep firing.
describe("policy.onFailure on an operator's run", () => {
  it("does not park the trigger when a manual run fails", async () => {
    workflow("wf-park-manual", {
      action: "boom",
      policy: { onFailure: "PARK" },
    });
    const store = (await service.store())!;
    await store.upsertTriggerState(scheduleRow("wf-park-manual"));

    const run = await service.fire(
      "wf-park-manual",
      undefined,
      "manual",
      undefined,
      CTX,
    );

    expect(run.status).toBe("FAILED");
    expect((await store.getTriggerState("wf-park-manual"))?.status).toBe(
      "ENABLED",
    );
  });

  it("does not park the trigger when a rerun fails", async () => {
    workflow("wf-park-rerun", {
      action: "boom",
      policy: { onFailure: "IGNORE" },
    });
    const store = (await service.store())!;
    await store.upsertTriggerState(scheduleRow("wf-park-rerun"));
    const failed = await service.fire("wf-park-rerun", undefined, "schedule");
    expect(failed.status).toBe("FAILED");
    documents.apply(
      "wf-park-rerun",
      actions.setPolicy({ onFailure: "PARK" } as never),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );

    const rerun = await service.rerun(failed.runId!, CTX);

    expect(rerun.status).toBe("FAILED");
    expect((await store.getTriggerState("wf-park-rerun"))?.status).toBe(
      "ENABLED",
    );
  });
});

function noteOp(documentId: string): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "SET_TITLE", input: { title: `t${ordinal}` } },
    },
    context: {
      documentId,
      documentType: "powerhouse/note",
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

function documentEventWorkflow(id: string) {
  return documents.apply(
    id,
    actions.setTrigger({
      id: "t1",
      pieceName: REACTOR_PIECE,
      pieceVersion: "1.0.0",
      triggerName: "document-event",
      config: { documentType: "powerhouse/note", actionType: "SET_TITLE" },
    }),
    actions.addStep({
      id: "a",
      key: "only",
      name: "Only",
      pieceName: PIECE,
      pieceVersion: "1.0.0",
      actionName: "boom",
      config: {},
    }),
    actions.addEdge({ id: "e1", from: "t1", to: "a", port: "next" }),
    actions.setPolicy({ onFailure: "PARK" } as never),
    actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
    actions.setWorkflowStatus({ status: "ENABLED" }),
  );
}

// PARK used to write only trigger_state, which a document-event trigger never
// reads, so the workflow kept firing while the log said it would not.
describe("PARK on a trigger the supervisor does not drive", () => {
  it("stops a document-event workflow firing", async () => {
    const id = "wf-park-event";
    await service.onOperations([workflowOp(id, documentEventWorkflow(id))]);
    const store = (await service.store())!;

    await service.onOperations([noteOp("note-1")]);
    await vi.waitFor(async () =>
      expect((await store.listRuns(id)).map((run) => run.status)).toEqual([
        "FAILED",
      ]),
    );
    await vi.waitFor(async () =>
      expect(await store.getWorkflowPark(id)).toBeDefined(),
    );

    await service.onOperations([noteOp("note-2")]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await store.listRuns(id)).toHaveLength(1);
  });
});

// The SDL and the log both say a park lasts until the workflow is re-published
// or re-enabled; a re-publish that left the trigger as it was used not to count.
describe("a re-publish of a PARKED workflow", () => {
  it("arms its schedule again with the trigger unchanged", async () => {
    const id = "wf-park-republish";
    const document = documents.apply(
      id,
      actions.setTrigger({
        id: "t1",
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "schedule",
        config: { mode: "cron", cron: "0 * * * *" },
      }),
      actions.addStep({
        id: "a",
        key: "only",
        name: "Only",
        pieceName: PIECE,
        pieceVersion: "1.0.0",
        actionName: "boom",
        config: {},
      }),
      actions.addEdge({ id: "e1", from: "t1", to: "a", port: "next" }),
      actions.setPolicy({ onFailure: "PARK" } as never),
      actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
    await service.onOperations([workflowOp(id, document)]);
    const store = (await service.store())!;
    await vi.waitFor(async () =>
      expect((await store.getTriggerState(id))?.status).toBe("ENABLED"),
    );
    expect((await service.fire(id, undefined, "schedule")).status).toBe(
      "FAILED",
    );
    expect((await store.getTriggerState(id))?.status).toBe(
      PARKED_TRIGGER_STATUS,
    );

    const republished = documents.apply(
      id,
      actions.setPolicy({ onFailure: "PARK", runTimeoutSeconds: 600 } as never),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );
    await service.onOperations([workflowOp(id, republished)]);

    await vi.waitFor(async () =>
      expect((await store.getTriggerState(id))?.status).toBe("ENABLED"),
    );
    expect((await service.fire(id, undefined, "schedule")).status).toBe(
      "FAILED",
    );
  }, 60_000);

  it("lets a document-event workflow fire again", async () => {
    const id = "wf-park-event-republish";
    await service.onOperations([workflowOp(id, documentEventWorkflow(id))]);
    const store = (await service.store())!;
    await service.onOperations([noteOp("note-r1")]);
    await vi.waitFor(async () =>
      expect(await store.listRuns(id)).toHaveLength(1),
    );
    await vi.waitFor(async () =>
      expect(await store.getWorkflowPark(id)).toBeDefined(),
    );

    const republished = documents.apply(
      id,
      actions.setPolicy({ onFailure: "PARK", runTimeoutSeconds: 600 } as never),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );
    await service.onOperations([workflowOp(id, republished)]);
    await service.onOperations([noteOp("note-r2")]);

    await vi.waitFor(async () =>
      expect(await store.listRuns(id)).toHaveLength(2),
    );
  }, 60_000);
});

// A QUEUE waiter used to run against the document it read before it queued,
// so a workflow disabled or parked meanwhile still ran its side effect.
describe("a firing that waited for its slot", () => {
  const gate = () =>
    (service as unknown as { runGate: WorkflowRunGate }).runGate;

  it("does not run once the workflow is disabled", async () => {
    const id = "wf-queue-disabled";
    workflow(id, {
      action: "slow",
      policy: { concurrency: "QUEUE", onFailure: "IGNORE" },
    });

    const first = service.fire(id, undefined, "schedule");
    const second = service.fire(id, undefined, "schedule");
    await vi.waitFor(() => expect(gate().waiting(id)).toBe(1));
    documents.apply(id, actions.setWorkflowStatus({ status: "DISABLED" }));

    expect((await first).status).toBe("SUCCEEDED");
    const queued = await second;
    expect(queued.status).toBe("CANCELLED");
    const store = (await service.store())!;
    expect(await store.getSteps(queued.runId!)).toHaveLength(0);
    expect((await store.getRun(queued.runId!))?.error).toContain("DISABLED");
  }, 60_000);

  it("does not run once the run ahead of it parked the workflow", async () => {
    const id = "wf-queue-parked";
    workflow(id, {
      action: "boom",
      policy: { concurrency: "QUEUE", onFailure: "PARK" },
    });
    // Holds the first run in its slot until the second is queued behind it.
    let releaseFirst!: () => void;
    const held = new Promise<void>((resolve) => (releaseFirst = resolve));
    const realAdmit = gate().admit.bind(gate());
    let admitted = 0;
    const admit = vi
      .spyOn(gate(), "admit")
      .mockImplementation(async (...args) => {
        const admission = await realAdmit(...args);
        admitted += 1;
        if (admitted === 1) await held;
        return admission;
      });

    const first = service.fire(id, undefined, "schedule");
    const second = service.fire(id, undefined, "schedule");
    await vi.waitFor(() => expect(gate().waiting(id)).toBe(1));
    releaseFirst();

    expect((await first).status).toBe("FAILED");
    const queued = await second;
    admit.mockRestore();
    expect(queued.status).toBe("CANCELLED");
    const store = (await service.store())!;
    expect(await store.getSteps(queued.runId!)).toHaveLength(0);
    expect((await store.getRun(queued.runId!))?.error).toContain("PARKED");
  }, 60_000);
});

function scheduleWorkflow(id: string) {
  return documents.apply(
    id,
    actions.setTrigger({
      id: "t1",
      pieceName: CORE_PIECE_NAME,
      pieceVersion: CORE_PIECE_VERSION,
      triggerName: "schedule",
      config: { mode: "cron", cron: "0 * * * *" },
    }),
    actions.addStep({
      id: "a",
      key: "only",
      name: "Only",
      pieceName: PIECE,
      pieceVersion: "1.0.0",
      actionName: "boom",
      config: {},
    }),
    actions.addEdge({ id: "e1", from: "t1", to: "a", port: "next" }),
    actions.setPolicy({ onFailure: "PARK" } as never),
    actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
    actions.setWorkflowStatus({ status: "ENABLED" }),
  );
}

// Runs `during` just before the run's journal closes, i.e. while it is in flight.
function whileClosing(during: () => Promise<void>) {
  const spy = vi.spyOn(WorkflowRunStore.prototype, "finishRun");
  spy.mockImplementationOnce(async function (this: WorkflowRunStore, ...args) {
    await during();
    spy.mockRestore();
    return this.finishRun(...args);
  });
  return spy;
}

// A failure that finishes after the workflow changed must not park the change.
describe("a failed run that outlived its workflow version", () => {
  it("does not park a workflow disabled while it ran", async () => {
    const id = "wf-park-disabled-midrun";
    await service.onOperations([workflowOp(id, scheduleWorkflow(id))]);
    const store = (await service.store())!;
    await vi.waitFor(async () =>
      expect((await store.getTriggerState(id))?.status).toBe("ENABLED"),
    );
    const finish = whileClosing(async () => {
      const disabled = documents.apply(
        id,
        actions.setWorkflowStatus({ status: "DISABLED" }),
      );
      await service.onOperations([workflowOp(id, disabled)]);
      await vi.waitFor(async () =>
        expect((await store.getTriggerState(id))?.status).toBe("DISABLED"),
      );
    });

    expect((await service.fire(id, undefined, "schedule")).status).toBe(
      "FAILED",
    );
    finish.mockRestore();

    expect(await store.getWorkflowPark(id)).toBeUndefined();
    const enabled = documents.apply(
      id,
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
    await service.onOperations([workflowOp(id, enabled)]);
    await vi.waitFor(async () =>
      expect((await store.getTriggerState(id))?.status).toBe("ENABLED"),
    );
  }, 60_000);

  it("does not park the version published while it ran", async () => {
    const id = "wf-park-republished-midrun";
    await service.onOperations([workflowOp(id, scheduleWorkflow(id))]);
    const store = (await service.store())!;
    await vi.waitFor(async () =>
      expect((await store.getTriggerState(id))?.status).toBe("ENABLED"),
    );
    const finish = whileClosing(async () => {
      const republished = documents.apply(
        id,
        actions.setPolicy({
          onFailure: "PARK",
          runTimeoutSeconds: 600,
        } as never),
        actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
      );
      await service.onOperations([workflowOp(id, republished)]);
    });

    expect((await service.fire(id, undefined, "schedule")).status).toBe(
      "FAILED",
    );
    finish.mockRestore();

    expect(await store.getWorkflowPark(id)).toBeUndefined();
    expect((await store.getTriggerState(id))?.status).toBe("ENABLED");
  }, 60_000);
});

// A disable this process never saw live still has to clear what the park left.
describe("a PARKED workflow disabled while the reactor was down", () => {
  it("arms again when re-enabled after the restart", async () => {
    const id = "wf-park-disabled-down";
    await service.onOperations([workflowOp(id, scheduleWorkflow(id))]);
    const store = (await service.store())!;
    await vi.waitFor(async () =>
      expect((await store.getTriggerState(id))?.status).toBe("ENABLED"),
    );
    expect((await service.fire(id, undefined, "schedule")).status).toBe(
      "FAILED",
    );
    expect((await store.getTriggerState(id))?.status).toBe(
      PARKED_TRIGGER_STATUS,
    );

    const disabled = documents.apply(
      id,
      actions.setWorkflowStatus({ status: "DISABLED" }),
    );
    const rebooted = testRuntime({
      reactorClient: documents.client() as never,
    });
    await rebooted.onOperations([workflowOp(id, disabled)]);
    const enabled = documents.apply(
      id,
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
    await rebooted.onOperations([workflowOp(id, enabled)]);

    const after = (await rebooted.store())!;
    await vi.waitFor(async () =>
      expect((await after.getTriggerState(id))?.status).toBe("ENABLED"),
    );
    rebooted.shutdown();
  }, 60_000);
});
