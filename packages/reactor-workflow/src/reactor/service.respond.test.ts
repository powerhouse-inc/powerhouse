// Synchronous replies (#3218): `run.respond` / `run.stop` answer the request a
// run holds, a sync webhook delivery or a `/sync` resume, through the worker.
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import {
  armWebhook,
  BASE_URL,
  CTX,
  fire,
  json,
  latestRun,
  POLL,
  runStatus,
  settles,
  stepsOf,
  tokenOf,
  waitpointSuite,
  webhookDelivery,
  type StepSpec,
} from "../../test/helpers/waitpoints.js";
import { runResponseReply } from "./service.js";

const ORIGIN_SAFE = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "sandbox",
};

const ACTIONS = `
    reply: {
      name: "reply",
      displayName: "Reply",
      props: { status, tag },
      run: async (ctx) => {
        ctx.run.respond({
          response: {
            status: ctx.propsValue.status,
            body: { tag: ctx.propsValue.tag },
            headers: { "X-Tag": ctx.propsValue.tag, "Set-Cookie": "no=1" },
          },
        });
        return { replied: true };
      },
    },
    text: {
      name: "text",
      displayName: "Text",
      props: {},
      run: async (ctx) => {
        ctx.run.respond({ response: { body: "plain", headers: { "content-type": "text/csv" } } });
        return {};
      },
    },
    stop: {
      name: "stop",
      displayName: "Stop",
      props: { status },
      run: async (ctx) => {
        ctx.run.stop({ response: { status: ctx.propsValue.status, body: { stopped: true } } });
        return { stopped: true };
      },
    },
    // Upstream's last-call-wins: a respond then a wait only waits.
    respondThenWait: {
      name: "respondThenWait",
      displayName: "Respond then wait",
      props: {},
      run: async (ctx) => {
        if (ctx.executionType === "RESUME") return { resumed: true };
        ctx.run.respond({ response: { status: 299, body: { lost: true } } });
        const waitpoint = await ctx.run.createWaitpoint({ type: "WEBHOOK" });
        ctx.run.waitForWaitpoint(waitpoint.id);
        return {};
      },
    },
    // Upstream's V0 pattern: a link minted before the deprecated pause.
    legacyLink: {
      name: "legacyLink",
      displayName: "Legacy link",
      props: {},
      run: async (ctx) => {
        if (ctx.executionType === "RESUME") {
          return { action: ctx.resumePayload.queryParams.action ?? null };
        }
        const url = ctx.generateResumeUrl({ queryParams: { action: "approve" } });
        const sync = ctx.generateResumeUrl({ queryParams: {}, sync: true });
        ctx.run.pause({ pauseMetadata: { type: "WEBHOOK" } });
        return { url, sync };
      },
    },
`;

const suite = waitpointSuite({ actions: ACTIONS });

const syncWebhook = (id: string, steps: StepSpec[], policy?: object) =>
  armWebhook(suite.service, suite.documents, id, "sync", steps, { policy });

const deliver = (id: string) =>
  suite.service.deliverWebhook(webhookDelivery(id));

async function waitingRun(id: string, stepKey = "gate") {
  const fired = await fire(suite.service, id);
  expect(fired.status).toBe("WAITING");
  const runId = fired.runId!;
  const waitpoints = await suite.service.waitpointsForRun(runId, CTX);
  expect(waitpoints.at(-1)?.stepKey).toBe(stepKey);
  const { url } = json<{ url: string }>(
    (await stepsOf(suite.service, runId))[stepKey]!.output,
  );
  return { runId, token: tokenOf(url) };
}

describe("a sync webhook", () => {
  it("answers with the first respond, and the run goes on", async () => {
    await syncWebhook("wf-respond", [
      ["first", "reply", { status: 201, tag: "first" }],
      ["second", "reply", { status: 202, tag: "second" }],
      ["after", "echo", { text: "after" }],
    ]);
    const reply = await deliver("wf-respond");

    expect(reply.status).toBe(201);
    expect(reply.contentType).toMatch(/application\/json/);
    expect(JSON.parse(reply.body!)).toEqual({ tag: "first" });
    // Names lowercased; a cookie on the host's origin is dropped.
    expect(reply.headers).toEqual({ "x-tag": "first", ...ORIGIN_SAFE });

    const runId = await latestRun(suite.service, "wf-respond");
    await settles(suite.service, runId, "SUCCEEDED");
    const journal = await stepsOf(suite.service, runId);
    expect(journal.second?.status).toBe("SUCCEEDED");
    expect(json(journal.after!.output)).toMatchObject({ text: "after" });
  });

  it("sends a string body as text, with the content type it was given", async () => {
    await syncWebhook("wf-text", [["text", "text"]]);
    const reply = await deliver("wf-text");

    expect(reply).toMatchObject({
      status: 200,
      contentType: "text/csv",
      body: "plain",
    });
  });

  it("answers with a respond before the run pauses", async () => {
    await syncWebhook("wf-respond-pause", [
      ["accept", "reply", { status: 200, tag: "accepted" }],
      ["gate", "gate"],
    ]);
    const reply = await deliver("wf-respond-pause");

    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body!)).toEqual({ tag: "accepted" });
    const runId = await latestRun(suite.service, "wf-respond-pause");
    await settles(suite.service, runId, "WAITING");
  });

  it("answers with the waitpoint's responseToSend when the run pauses", async () => {
    await syncWebhook("wf-response-to-send", [
      ["gate", "gate", { status: 202 }],
    ]);
    const reply = await deliver("wf-response-to-send");

    expect(reply.status).toBe(202);
    expect(JSON.parse(reply.body!)).toEqual({ waiting: true });
  });

  it("pauses without answering when a wait follows the respond in one step", async () => {
    await syncWebhook("wf-last-wins", [["gate", "respondThenWait"]]);
    const reply = await deliver("wf-last-wins");

    // The run's own answer for a pause, not the overridden respond.
    expect(reply.status).toBe(202);
    expect(JSON.parse(reply.body!)).toMatchObject({ status: "WAITING" });
  });

  // A run on QUEUE holding the only slot, and a second delivery queued behind it.
  async function queuedBehind(id: string, steps: StepSpec[]) {
    await syncWebhook(id, steps, { concurrency: "QUEUE" });
    const withStatus = async (status: string) =>
      (await suite.service.runs({ workflowId: id }, CTX)).find(
        (record) => record.row.status === status,
      );
    const first = deliver(id);
    await expect.poll(() => withStatus("RUNNING"), POLL).toBeDefined();
    const second = deliver(id);
    await expect.poll(() => withStatus("PENDING"), POLL).toBeDefined();
    const pending = (await withStatus("PENDING"))!.row.id;
    return { first, second, pending };
  }

  it("answers 409 at once for a queued run an operator cancelled", async () => {
    const { flag, release } = suite.latch("queued-cancel");
    const { first, second, pending } = await queuedBehind("wf-queued-cancel", [
      ["hold", "hold", { flag }],
    ]);

    await suite.service.cancelRun(pending, CTX);
    // Answered while the running run still holds the slot.
    const reply = await second;

    expect(reply.status).toBe(409);
    expect(JSON.parse(reply.body!)).toEqual({
      runId: pending,
      status: "CANCELLED",
      error: "Cancelled by 0xabc",
    });
    expect(await runStatus(suite.service, pending)).toBe("CANCELLED");
    await release();
    expect((await first).status).toBe(200);
  });

  it("answers a queued run closed elsewhere with its own end when the workflow parks", async () => {
    const { flag, release } = suite.latch("queued-park");
    const { first, second, pending } = await queuedBehind("wf-queued-park", [
      ["hold", "hold", { flag }],
      ["fail", "flaky"],
    ]);
    // Another process's cancel: this one's held caller is not told of it.
    await (await suite.service.store())!.cancelIdleRun(
      pending,
      "Cancelled by 0xabc",
    );

    await release();
    const reply = await second;

    expect(reply.status).toBe(409);
    expect(JSON.parse(reply.body!)).toEqual({
      runId: pending,
      status: "CANCELLED",
      error: "Cancelled by 0xabc",
    });
    expect((await first).status).toBe(500);
  });

  it("stops the run SUCCEEDED, answering with the stop's response", async () => {
    await syncWebhook("wf-stop", [
      ["stop", "stop", { status: 201 }],
      ["after", "echo", { text: "never" }],
    ]);
    const reply = await deliver("wf-stop");

    expect(reply.status).toBe(201);
    expect(JSON.parse(reply.body!)).toEqual({ stopped: true });
    const runId = await latestRun(suite.service, "wf-stop");
    await settles(suite.service, runId, "SUCCEEDED");
    const journal = await stepsOf(suite.service, runId);
    expect(journal.stop?.status).toBe("SUCCEEDED");
    expect(journal.after?.status ?? "SKIPPED").toBe("SKIPPED");
  });
});

describe("runResponseReply", () => {
  it("skips headers node:http would refuse to send", () => {
    const reply = runResponseReply({
      body: {},
      headers: {
        "x-ok": "1",
        "x-latin": "café",
        "x-emoji": "ok 😀",
        "x-cjk": "日本",
        "bad name": "v",
        "content-type": "text/plain; 😀",
      },
    });

    expect(reply.headers).toEqual({
      "x-ok": "1",
      "x-latin": "café",
      ...ORIGIN_SAFE,
    });
    expect(reply.contentType).toMatch(/application\/json/);
  });

  it("sandboxes a step's HTML on the host's origin", () => {
    const reply = runResponseReply({
      body: "<script>alert(1)</script>",
      headers: {
        "content-type": "text/html",
        "Content-Security-Policy": "default-src *",
        "x-content-type-options": "off",
        "set-cookie": "session=stolen",
      },
    });

    expect(reply.contentType).toBe("text/html");
    expect(reply.headers).toEqual(ORIGIN_SAFE);
  });
});

describe("a /sync resume", () => {
  it("is answered by the resumed leg's respond, before the run ends", async () => {
    const { flag, release } = suite.latch("sync-respond");
    suite.define("wf-sync-respond", [
      ["gate", "gate", { tag: "resumed" }],
      ["hold", "hold", { flag }],
    ]);
    const { runId, token } = await waitingRun("wf-sync-respond");

    const { status, reply } = await suite.service.resumeWaitpointByTokenSync(
      token,
      { queryParams: { action: "approve" } },
    );

    expect(status).toBe("resumed");
    expect(reply?.status).toBe(200);
    expect(JSON.parse(reply!.body!)).toEqual({
      tag: "resumed",
      action: "approve",
    });
    expect(await runStatus(suite.service, runId)).toBe("RUNNING");
    await release();
    await settles(suite.service, runId, "SUCCEEDED");
  });

  it("is answered with the run's outcome when the leg ends without one", async () => {
    suite.define("wf-sync-end", [
      ["gate", "gate"],
      ["after", "echo", { text: "after" }],
    ]);
    const { runId, token } = await waitingRun("wf-sync-end");

    const { reply } = await suite.service.resumeWaitpointByTokenSync(token, {
      queryParams: {},
    });

    expect(reply?.status).toBe(200);
    expect(JSON.parse(reply!.body!)).toEqual({
      runId,
      status: "SUCCEEDED",
      error: null,
    });
  });

  it("is answered when the leg pauses again, with its responseToSend", async () => {
    suite.define("wf-sync-again", [
      ["gate", "gate"],
      ["again", "gate", { status: 203 }],
      ["last", "gate"],
    ]);
    const { runId, token } = await waitingRun("wf-sync-again");

    const first = await suite.service.resumeWaitpointByTokenSync(token, {
      queryParams: {},
    });
    expect(first.reply?.status).toBe(203);
    expect(JSON.parse(first.reply!.body!)).toEqual({ waiting: true });

    // No responseToSend: the run's own answer for a pause.
    await settles(suite.service, runId, "WAITING");
    const { url } = json<{ url: string }>(
      (await stepsOf(suite.service, runId)).again!.output,
    );
    const second = await suite.service.resumeWaitpointByTokenSync(
      tokenOf(url),
      { queryParams: {} },
    );
    expect(second.reply?.status).toBe(202);
    expect(JSON.parse(second.reply!.body!)).toMatchObject({
      runId,
      status: "WAITING",
    });
  });

  it("answers 504 when the leg outlasts the timeout, and the run goes on", async () => {
    const { flag, release } = suite.latch("sync-timeout");
    suite.define("wf-sync-timeout", [
      ["gate", "gate"],
      ["hold", "hold", { flag }],
    ]);
    const { runId, token } = await waitingRun("wf-sync-timeout");

    const { status, reply } = await suite.service.resumeWaitpointByTokenSync(
      token,
      { queryParams: {} },
      { timeoutMs: 200 },
    );

    expect(status).toBe("resumed");
    expect(reply?.status).toBe(504);
    expect(await runStatus(suite.service, runId)).toBe("RUNNING");
    await release();
    await settles(suite.service, runId, "SUCCEEDED");
  });

  it("is answered CANCELLED at once when the run is cancelled", async () => {
    // One run in flight, so the resumed leg waits for admission.
    vi.stubEnv("PH_WORKFLOWS_RUNS_IN_FLIGHT", "1");
    onTestFinished(() => void vi.unstubAllEnvs());
    const narrow = suite.runtime();
    const { flag, release } = suite.latch("sync-busy");
    suite.define("wf-sync-cancel", [["gate", "gate"]]);
    suite.define("wf-sync-busy", [["hold", "hold", { flag }]]);
    const fired = await fire(narrow, "wf-sync-cancel");
    expect(fired.status).toBe("WAITING");
    const runId = fired.runId!;
    const { url } = json<{ url: string }>(
      (await stepsOf(narrow, runId)).gate!.output,
    );
    const busy = fire(narrow, "wf-sync-busy");
    await expect
      .poll(
        async () =>
          (await narrow.runs({ workflowId: "wf-sync-busy" }, CTX))[0]?.row
            .status,
        POLL,
      )
      .toBe("RUNNING");

    const held = narrow.resumeWaitpointByTokenSync(
      tokenOf(url),
      { queryParams: {} },
      { timeoutMs: 10_000 },
    );
    const [waitpoint] = await narrow.waitpointsForRun(runId, CTX);
    await expect
      .poll(
        async () =>
          (await (await narrow.store())!.getWaitpoint(waitpoint!.id))?.status,
        POLL,
      )
      .toBe("COMPLETED");
    await narrow.cancelRun(runId, CTX);
    // Answered while the busy run still holds the only slot.
    const { status, reply } = await held;

    expect(status).toBe("resumed");
    expect(reply?.status).toBe(409);
    expect(JSON.parse(reply!.body!)).toEqual({
      runId,
      status: "CANCELLED",
      error: "Cancelled by 0xabc",
    });
    expect(
      (await narrow.runs({ workflowId: "wf-sync-busy" }, CTX))[0]?.row.status,
    ).toBe("RUNNING");
    await release();
    await busy;
    expect(await runStatus(narrow, runId)).toBe("CANCELLED");
  });

  it("answers the request that won a raced token, and the other already", async () => {
    suite.define("wf-sync-race", [["gate", "gate", { tag: "won" }]]);
    const { token } = await waitingRun("wf-sync-race");

    const [a, b] = await Promise.all(
      ["a", "b"].map((action) =>
        suite.service.resumeWaitpointByTokenSync(
          token,
          { queryParams: { action } },
          { timeoutMs: 5000 },
        ),
      ),
    );

    const results = [
      { action: "a", ...a },
      { action: "b", ...b },
    ];
    const won = results.filter((result) => result.status === "resumed");
    expect(won).toHaveLength(1);
    expect(won[0]!.reply?.status).toBe(200);
    expect(JSON.parse(won[0]!.reply!.body!)).toEqual({
      tag: "won",
      action: won[0]!.action,
    });
    const lost = results.find((result) => result.status !== "resumed")!;
    expect(lost).toMatchObject({ status: "already" });
    expect(lost.reply).toBeUndefined();
  });

  it("is answered CANCELLED when the workflow was disabled meanwhile", async () => {
    suite.define("wf-sync-disabled", [
      ["gate", "gate", { tag: "never" }],
      ["after", "echo", { text: "never" }],
    ]);
    const { runId, token } = await waitingRun("wf-sync-disabled");
    suite.documents.apply(
      "wf-sync-disabled",
      actions.setWorkflowStatus({ status: "DISABLED" }),
    );

    const { status, reply } = await suite.service.resumeWaitpointByTokenSync(
      token,
      { queryParams: {} },
    );

    expect(status).toBe("resumed");
    expect(reply?.status).toBe(409);
    expect(JSON.parse(reply!.body!)).toMatchObject({
      runId,
      status: "CANCELLED",
    });
    const row = (await (await suite.service.store())!.getRun(runId))!;
    expect(row.status).toBe("CANCELLED");
    expect(row.error_name).toBe("WorkflowDisabled");
    expect((await stepsOf(suite.service, runId)).after).toBeUndefined();
  });

  it("answers a used or unknown token without holding", async () => {
    suite.define("wf-sync-gone", [["gate", "gate"]]);
    const { runId, token } = await waitingRun("wf-sync-gone");
    await suite.service.resumeWaitpointByTokenSync(token, { queryParams: {} });
    await settles(suite.service, runId, "SUCCEEDED");

    expect(
      await suite.service.resumeWaitpointByTokenSync(token, {
        queryParams: {},
      }),
    ).toEqual({ status: "already" });
    expect(
      await suite.service.resumeWaitpointByTokenSync("nope", {
        queryParams: {},
      }),
    ).toEqual({ status: "gone" });
  });
});

describe("the deprecated generateResumeUrl", () => {
  it("links to the waitpoint the step's run.pause creates", async () => {
    suite.define("wf-legacy-link", [["legacy", "legacyLink"]]);
    const fired = await fire(suite.service, "wf-legacy-link");
    expect(fired.status).toBe("WAITING");
    const runId = fired.runId!;
    const { url, sync } = json<{ url: string; sync: string }>(
      (await stepsOf(suite.service, runId)).legacy!.output,
    );
    expect(url).toMatch(new RegExp(`^${BASE_URL}/[\\w-]+\\?action=approve$`));
    // One token per step; sync only changes the sub-path.
    expect(sync).toBe(`${url.split("?")[0]}/sync`);

    expect(
      await suite.service.resumeWaitpointByToken(tokenOf(url), {
        queryParams: { action: "approve" },
      }),
    ).toEqual({ status: "resumed" });
    await settles(suite.service, runId, "SUCCEEDED");
    expect(json((await stepsOf(suite.service, runId)).legacy!.output)).toEqual({
      action: "approve",
    });
  });
});
