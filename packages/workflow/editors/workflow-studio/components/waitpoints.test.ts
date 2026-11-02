import { describe, expect, it } from "vitest";
import type {
  RunRecord,
  WaitpointRecord,
} from "../../workflow-editor/runtime-client.js";
import {
  approvalCountLabel,
  approvalCountText,
  cancelFailure,
  countPendingApprovals,
  isOpenApproval,
  reasonRequired,
  waitDescription,
} from "./Waitpoints.js";
import { formatAbsolute } from "./run-format.js";
import { waitpointRecord } from "../../../test/waitpoint-record.js";

const approval = (reasonRequiredOn: "none" | "reject" | "both") => ({
  title: "Pay?",
  body: null,
  approveLabel: "Pay",
  rejectLabel: "Hold",
  reasonRequiredOn,
  approvers: [],
});

describe("reasonRequired", () => {
  it("follows the approval's policy per decision", () => {
    expect(reasonRequired(waitpointRecord(), false)).toBe(false);
    const reject = waitpointRecord({ approval: approval("reject") });
    expect(reasonRequired(reject, true)).toBe(false);
    expect(reasonRequired(reject, false)).toBe(true);
    const both = waitpointRecord({ approval: approval("both") });
    expect(reasonRequired(both, true)).toBe(true);
  });
});

// A callback wait, as Respond and wait for webhook or createWaitpoint makes.
const callback = (overrides: Partial<WaitpointRecord> = {}) =>
  waitpointRecord({
    blockName: "wait_for_webhook",
    kind: "webhook",
    ...overrides,
  });

describe("isOpenApproval", () => {
  it("takes pending approval waitpoints only", () => {
    expect(isOpenApproval(waitpointRecord())).toBe(true);
    expect(isOpenApproval(callback())).toBe(false);
    expect(
      isOpenApproval(waitpointRecord({ type: "DELAY", kind: "delay" })),
    ).toBe(false);
    expect(isOpenApproval(waitpointRecord({ status: "CONSUMED" }))).toBe(false);
  });
});

const run = (
  id: string,
  workflowId: string,
  waitpoints: WaitpointRecord[] | undefined,
): RunRecord => ({ id, workflowId, waitpoints }) as RunRecord;

describe("countPendingApprovals", () => {
  it("counts open approvals per workflow, skipping delays and settled ones", () => {
    const counts = countPendingApprovals(
      [
        run("r1", "wf-1", [
          waitpointRecord({ id: "a" }),
          waitpointRecord({ id: "b", type: "DELAY", kind: "delay" }),
          callback({ id: "g" }),
        ]),
        run("r6", "wf-5", [callback({ id: "h" })]),
        run("r2", "wf-1", [waitpointRecord({ id: "c" })]),
        run("r3", "wf-2", [waitpointRecord({ id: "d", status: "COMPLETED" })]),
        run("r4", "wf-3", undefined),
        run("r5", "wf-4", [
          waitpointRecord({ id: "e" }),
          waitpointRecord({ id: "f" }),
        ]),
      ],
      100,
    );
    expect(counts.total).toBe(4);
    expect([...counts.byWorkflow]).toEqual([
      ["wf-1", 2],
      ["wf-4", 2],
    ]);
    expect(counts.capped).toBe(false);
  });

  it("is empty while the query loads", () => {
    const counts = countPendingApprovals(undefined, 100);
    expect(counts.total).toBe(0);
    expect(counts.byWorkflow.size).toBe(0);
    expect(counts.capped).toBe(false);
  });

  it("marks counts as lower bounds when the response fills the limit", () => {
    const runs = [
      run("r1", "wf-1", [waitpointRecord()]),
      run("r2", "wf-1", [waitpointRecord({ type: "DELAY", kind: "delay" })]),
    ];
    const counts = countPendingApprovals(runs, 2);
    expect(counts).toMatchObject({ total: 1, capped: true });
    expect(approvalCountText(counts.total, counts.capped)).toBe("1+");
  });
});

describe("approvalCountLabel", () => {
  it("names the count for assistive tech", () => {
    expect(approvalCountLabel(1, false)).toBe("1 approval waiting");
    expect(approvalCountLabel(3, false)).toBe("3 approvals waiting");
    expect(approvalCountLabel(100, true)).toBe("100+ approvals waiting");
  });
});

describe("waitDescription", () => {
  it("says a Call workflow step waits for the called workflow", () => {
    expect(
      waitDescription(callback(), "Review", {
        pieceName: "@activepieces/piece-subflows",
        blockName: "callFlow",
      }),
    ).toBe("Review is waiting for the called workflow to respond");
  });

  it("says what a callback or a delay waits for", () => {
    expect(waitDescription(callback(), "Hook")).toBe(
      "Hook is waiting for a webhook callback",
    );
    const expiresAt = "2026-10-15T10:00:00.000Z";
    expect(waitDescription(callback({ expiresAt }), "Hook")).toBe(
      `Hook is waiting for a webhook callback, until ${formatAbsolute(expiresAt)}`,
    );
    const resumeAt = "2026-10-14T11:00:00.000Z";
    expect(
      waitDescription(
        waitpointRecord({ type: "DELAY", kind: "delay", resumeAt }),
        "Pause",
      ),
    ).toBe(`Pause is waiting until ${formatAbsolute(resumeAt)}`);
  });
});

describe("cancelFailure", () => {
  it("takes a cancelled run's reason as success", () => {
    expect(
      cancelFailure({ status: "CANCELLED", error: "Cancelled by did:x" }),
    ).toBeNull();
    expect(cancelFailure({ status: "WAITING", error: null })).toBe(
      "The run is WAITING",
    );
    expect(cancelFailure({ status: "FAILED", error: "boom" })).toBe("boom");
    expect(cancelFailure(null)).toBe("The run was not found");
  });
});
