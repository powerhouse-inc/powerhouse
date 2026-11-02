// A core wait re-entering as RESUME reads only its resumePayload, so an
// upstream output the journal truncated must not fail it after the decision.
import { describe, expect, it } from "vitest";
import {
  armWebhook,
  CORE,
  CTX,
  fire,
  json,
  latestRun,
  POLL,
  runStatus,
  stepsOf,
  waitpointSuite,
  webhookDelivery,
  type StepSpec,
} from "../../test/helpers/waitpoints.js";
import { STEP_PAYLOAD_MAX_BYTES } from "./store.js";

const suite = waitpointSuite();

// Approves the run's one approval; returns the settled run's status and steps.
async function approve(runId: string) {
  const [waitpoint] = await suite.service.waitpointsForRun(runId, CTX);
  await suite.service.resolveWaitpoint(waitpoint!.id, { approved: true }, CTX);
  await expect
    .poll(() => runStatus(suite.service, runId), POLL)
    .toMatch(/SUCCEEDED|FAILED/);
  return {
    status: await runStatus(suite.service, runId),
    steps: await stepsOf(suite.service, runId),
  };
}

describe("a resumed core wait", () => {
  it("completes when its body references an output the journal truncated", async () => {
    suite.define(
      "wf-resume-truncated",
      [
        [
          "big",
          "assert",
          {
            value: { small: "v1", pad: "x".repeat(STEP_PAYLOAD_MAX_BYTES + 1) },
          },
        ],
        [
          "approve",
          "approval",
          { title: "Ship?", body: "Ship {{steps.big.output.value.small}}" },
        ],
        ["after", "assert", { value: "{{steps.approve.output.approved}}" }],
      ],
      { piece: CORE },
    );
    const fired = await fire(suite.service, "wf-resume-truncated");
    expect(fired.status).toBe("WAITING");
    const [waitpoint] = await suite.service.waitpointsForRun(fired.runId!, CTX);
    expect(waitpoint!.approval?.body).toBe("Ship v1");

    const run = await approve(fired.runId!);
    expect(run.steps.approve!.error ?? null).toBeNull();
    expect(run.status).toBe("SUCCEEDED");
    expect(json(run.steps.approve!.output)).toMatchObject({
      approved: true,
      decidedBy: "0xabc",
    });
    expect(json<{ value: unknown }>(run.steps.after!.output).value).toBe(true);
  });
});

// Delivers to an async webhook workflow, then approves its one approval.
async function deliverAndApprove(id: string, steps: StepSpec[]) {
  await armWebhook(suite.service, suite.documents, id, "async", steps, {
    piece: CORE,
  });
  const reply = await suite.service.deliverWebhook(
    webhookDelivery(id, {
      body: { id: "evt_1" },
      headers: { authorization: "Bearer s3cret" },
    }),
  );
  expect(reply.status).toBe(202);
  const runId = await latestRun(suite.service, id);
  await expect
    .poll(() => runStatus(suite.service, runId), POLL)
    .toBe("WAITING");
  return approve(runId);
}

describe("a resumed leg reading a redacted journal", () => {
  it("reads the unredacted fields of the trigger payload and step outputs", async () => {
    const run = await deliverAndApprove("wf-resume-redacted", [
      ["creds", "assert", { value: { access_token: "t0k", id: "c1" } }],
      ["approve", "approval", { title: "Ship?" }],
      [
        "after",
        "assert",
        {
          value: {
            event: "{{trigger.payload.body.id}}",
            type: "{{trigger.payload.headers.content-type}}",
            creds: "{{steps.creds.output.value.id}}",
          },
        },
      ],
    ]);
    expect(run.steps.after!.error ?? null).toBeNull();
    expect(run.status).toBe("SUCCEEDED");
    expect(json(run.steps.after!.output)).toEqual({
      value: { event: "evt_1", type: "application/json", creds: "c1" },
    });
  });

  it("still fails a step that reads a redacted header by name", async () => {
    const run = await deliverAndApprove("wf-resume-redacted-header", [
      ["approve", "approval", { title: "Ship?" }],
      [
        "after",
        "assert",
        { value: "{{trigger.payload.headers.authorization}}" },
      ],
    ]);
    expect(run.status).toBe("FAILED");
    expect(run.steps.after!.error).toMatch(/trigger payload/);
    expect(run.steps.after!.error).toMatch(/headers\.authorization/);
  });

  it("still fails a step that reads a redacted step output field", async () => {
    const run = await deliverAndApprove("wf-resume-redacted-output", [
      ["creds", "assert", { value: { access_token: "t0k", id: "c1" } }],
      ["approve", "approval", { title: "Ship?" }],
      [
        "after",
        "assert",
        { value: "{{steps.creds.output.value.access_token}}" },
      ],
    ]);
    expect(run.status).toBe("FAILED");
    expect(run.steps.after!.error).toMatch(/"creds"/);
    expect(run.steps.after!.error).toMatch(/value\.access_token/);
  });
});
