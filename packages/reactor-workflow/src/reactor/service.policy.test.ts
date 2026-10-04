// `policy.concurrency` and `policy.onFailure`, enforced in the service: both
// were document-model fields nothing read (backlog item 4, W3.3).
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Documents } from "../../test/helpers/documents.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { packagePieces } from "./piece-registry.js";
import { PARKED_TRIGGER_STATUS } from "./policy.js";
import type { WorkflowRuntimeService } from "./service.js";
import { CORE_PIECE_VERSION } from "../pieces/index.js";

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
      updated_at: new Date().toISOString(),
    });

    const run = await service.fire(
      "wf-park",
      undefined,
      "manual",
      undefined,
      CTX,
    );

    expect(run.status).toBe("FAILED");
    const row = await store!.getTriggerState("wf-park");
    expect(row?.status).toBe(PARKED_TRIGGER_STATUS);
    expect(row?.last_error).toContain("onFailure = PARK");
    // The supervisor's due query only returns ENABLED rows, so a parked
    // trigger is not due however overdue its next_poll_at is.
    const due = await store!.listDueTriggerStates(new Date().toISOString());
    expect(due.map((entry) => entry.workflow_id)).not.toContain("wf-park");
  });

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
      updated_at: new Date().toISOString(),
    });

    await service.fire("wf-ignore", undefined, "manual", undefined, CTX);

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
      updated_at: new Date().toISOString(),
    });

    await notifying.fire("wf-notify", undefined, "manual", undefined, CTX);
    notifying.shutdown();

    expect((await store!.getTriggerState("wf-notify"))?.status).toBe("ENABLED");
    expect(logged.join("\n")).toContain("NOTIFY");
  });
});
