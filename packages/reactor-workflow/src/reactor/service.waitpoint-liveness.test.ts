// Which waitpoints may resume or reveal a run: only the one it waits on and
// links a succeeded step made, one per step, none once the run has ended.
import { describe, expect, it, vi } from "vitest";
import {
  CTX,
  fire,
  json,
  POLL,
  runOf,
  runStatus,
  settles,
  stepsOf,
  tokenOf,
  waitpointSuite,
} from "../../test/helpers/waitpoints.js";

const SECRET = "doc-secret";

const ACTIONS = `
    retried: {
      name: "retried",
      displayName: "Retried",
      props: {},
      run: async (ctx) => {
        if (ctx.executionType === "RESUME") {
          return { body: ctx.resumePayload.body ?? null };
        }
        const waitpoint = await ctx.run.createWaitpoint({ type: "WEBHOOK" });
        const key = "first-" + ctx.run.id;
        const first = await ctx.store.get(key);
        if (first === null || first === undefined) {
          await ctx.store.put(key, { id: waitpoint.id, url: waitpoint.resumeUrl });
          throw new Error("failed after createWaitpoint");
        }
        ctx.run.waitForWaitpoint(waitpoint.id);
        return { first, second: { id: waitpoint.id, url: waitpoint.resumeUrl } };
      },
    },
    early: {
      name: "early",
      displayName: "Early",
      props: { flag: { displayName: "Flag", type: "SHORT_TEXT", required: true } },
      run: async (ctx) => {
        const key = "same-" + ctx.run.id;
        if (ctx.executionType === "RESUME") {
          return {
            action: ctx.resumePayload.queryParams.action ?? null,
            same: await ctx.store.get(key),
          };
        }
        const a = await ctx.run.createWaitpoint({ type: "WEBHOOK" });
        const deadline = Date.now() + 15000;
        while (!existsSync(ctx.propsValue.flag) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        const b = await ctx.run.createWaitpoint({ type: "WEBHOOK" });
        await ctx.store.put(key, a.id === b.id && a.resumeUrl === b.resumeUrl);
        ctx.run.waitForWaitpoint(b.id);
        return {};
      },
    },
    again: {
      name: "again",
      displayName: "Again",
      props: {},
      run: async (ctx) => {
        const round = ctx.executionType === "RESUME" ? ctx.resumePayload.body.round : 0;
        if (round >= 2) return { round };
        const waitpoint = await ctx.run.createWaitpoint({ type: "WEBHOOK" });
        ctx.run.waitForWaitpoint(waitpoint.id);
        return { id: waitpoint.id, url: waitpoint.resumeUrl };
      },
    },
`;

const suite = waitpointSuite({
  actions: ACTIONS,
  runtime: {
    assertCanRead: (documentId: string) =>
      documentId === SECRET
        ? Promise.reject(new Error("forbidden"))
        : Promise.resolve(undefined),
  },
});

const RETRY = {
  maxAttempts: 2,
  backoff: "FIXED",
  initialDelaySeconds: 0,
  maxDelaySeconds: 0,
  retryOn: [],
};

const approval = {
  title: "Ship?",
  body: "Deploys to production.",
  approvers: ["did:pkh:eip155:1:0xA11CE"],
};

const resumeBody = { queryParams: {}, body: { approved: true }, headers: {} };

async function store() {
  return (await suite.service.store())!;
}

const status = (runId: string) => runStatus(suite.service, runId);
const steps = (runId: string) => stepsOf(suite.service, runId);

async function waitpoint(runId: string, stepKey: string) {
  return (await suite.service.waitpointsForRun(runId, CTX)).find(
    (w) => w.stepKey === stepKey,
  )!;
}

async function statuses(runId: string) {
  return (await suite.service.waitpointsForRun(runId, CTX)).map(
    (w) => `${w.stepKey}:${w.status}`,
  );
}

async function rows(runId: string) {
  return suite.db
    .selectFrom("waitpoint")
    .select(["id", "status"])
    .where("run_id", "=", runId)
    .orderBy("created_at")
    .execute();
}

// A step's journaled output once it SUCCEEDED, read while the run goes on.
async function succeededOutput(workflowId: string, stepKey: string) {
  return vi.waitFor(async () => {
    const row = await suite.db
      .selectFrom("step_execution")
      .innerJoin("run", "run.id", "step_execution.run_id")
      .select(["step_execution.output", "step_execution.run_id"])
      .where("step_execution.step_key", "=", stepKey)
      .where("step_execution.status", "=", "SUCCEEDED")
      .where("run.workflow_id", "=", workflowId)
      .executeTakeFirst();
    expect(row).toBeDefined();
    return row!;
  }, POLL);
}

const linkToken = (raw: string | null | undefined) =>
  tokenOf(json<{ url: string }>(raw).url);

// Due now, as if its expiry had passed.
async function overdue(where: { id?: string; runId?: string }) {
  const query = suite.db
    .updateTable("waitpoint")
    .set({ expires_at: new Date(Date.now() - 1000).toISOString() });
  await (
    where.id
      ? query.where("id", "=", where.id)
      : query.where("run_id", "=", where.runId!)
  ).execute();
}

// The sweep's expiries and ends for one run; the file's database is shared.
async function expireDue(runId: string) {
  const swept = await (
    await store()
  ).expireDueWaitpoints(new Date().toISOString(), 100);
  return {
    expired: swept.expired.filter((w) => w.run_id === runId),
    ended: swept.ended.filter((end) => end.runId === runId),
  };
}

describe("a link another step made", () => {
  it("cannot decide an approval the run waits on", async () => {
    suite.define("wf-link-approval", [
      ["link", "link"],
      ["approve", "core:approval", approval],
    ]);
    const fired = await fire(suite.service, "wf-link-approval");
    expect(fired.status).toBe("WAITING");
    const runId = fired.runId!;
    const token = linkToken((await steps(runId)).link!.output);

    expect(
      await suite.service.resumeWaitpointByToken(token, resumeBody),
    ).toEqual({ status: "gone" });
    const link = await waitpoint(runId, "link");
    await expect(
      suite.service.resolveWaitpoint(link.id, { approved: true }, CTX),
    ).rejects.toThrow(/not the one its run waits on/);
    expect(link.status).toBe("PENDING");
    expect((await waitpoint(runId, "approve")).status).toBe("PENDING");
    expect(await status(runId)).toBe("WAITING");
    expect((await steps(runId)).approve!.status).toBe("WAITING");
  });

  it("cannot end a delay early", async () => {
    suite.define("wf-link-delay", [
      ["link", "link"],
      ["wait", "core:delay", { mode: "for", amount: 1, unit: "hours" }],
    ]);
    const fired = await fire(suite.service, "wf-link-delay");
    expect(fired.status).toBe("WAITING");
    const runId = fired.runId!;
    const token = linkToken((await steps(runId)).link!.output);

    expect(
      await suite.service.resumeWaitpointByToken(token, resumeBody),
    ).toEqual({ status: "gone" });
    expect((await waitpoint(runId, "wait")).status).toBe("PENDING");
    expect(await status(runId)).toBe("WAITING");
  });

  it("resolved before the run waits on an approval, is closed", async () => {
    const { flag, release } = suite.latch("link-early");
    suite.define("wf-link-early", [
      ["link", "link"],
      ["hold", "hold", { flag }],
      ["approve", "core:approval", approval],
    ]);
    const firing = fire(suite.service, "wf-link-early");
    const linkRow = await succeededOutput("wf-link-early", "link");
    expect(
      await suite.service.resumeWaitpointByToken(
        linkToken(linkRow.output),
        resumeBody,
      ),
    ).toEqual({ status: "resumed" });
    await release();
    const fired = await firing;
    expect(fired.status).toBe("WAITING");
    const runId = fired.runId!;
    expect((await waitpoint(runId, "link")).status).toBe("CANCELLED");
    expect((await waitpoint(runId, "approve")).status).toBe("PENDING");
    // Nothing is left for a poll to redeliver.
    const journal = await store();
    expect(await journal.hasCompletedWaitpoint(runId)).toBe(false);
    expect(await journal.heldRunIds()).not.toContain(runId);
    expect(await status(runId)).toBe("WAITING");
  });
});

describe("an expired waitpoint the poller has not swept", () => {
  it("cannot be completed", async () => {
    suite.define("wf-expired", [
      ["approve", "core:approval", { title: "Ship?" }],
    ]);
    const runId = (await fire(suite.service, "wf-expired")).runId!;
    const gate = await waitpoint(runId, "approve");
    await overdue({ id: gate.id });

    await expect(
      suite.service.resolveWaitpoint(gate.id, { approved: true }, CTX),
    ).rejects.toThrow(/is EXPIRED/);
    const journal = await store();
    expect(
      await journal.completeWaitpoint(gate.id, { payload: {} }),
    ).toBeUndefined();
    expect((await journal.getWaitpoint(gate.id))!.status).toBe("PENDING");
    expect(await status(runId)).toBe("WAITING");
  });

  it("refuses its resume URL as gone", async () => {
    const { flag, release } = suite.latch("expired-link");
    suite.define("wf-expired-link", [
      ["link", "link"],
      ["hold", "hold", { flag }],
    ]);
    const firing = fire(suite.service, "wf-expired-link");
    const linkRow = await succeededOutput("wf-expired-link", "link");
    await overdue({ runId: linkRow.run_id });
    expect(
      await suite.service.resumeWaitpointByToken(
        linkToken(linkRow.output),
        resumeBody,
      ),
    ).toEqual({ status: "gone" });
    await release();
    await firing;
  });
});

describe("a run the caller is not served", () => {
  it("is neither cancelled nor resolved for it, as run() withholds it", async () => {
    suite.define("wf-hidden", [
      ["approve", "core:approval", { title: "Ship?" }],
    ]);
    const runId = (await fire(suite.service, "wf-hidden")).runId!;
    const gate = await waitpoint(runId, "approve");
    // A document a step was handed that this caller may not read.
    await (await store()).recordRunDocuments(runId, [SECRET]);

    expect(await suite.service.run(runId, CTX)).toBeNull();
    await expect(
      suite.service.resolveWaitpoint(gate.id, { approved: true }, CTX),
    ).rejects.toThrow(/not found/);
    await expect(suite.service.cancelRun(runId, CTX)).rejects.toThrow(
      /not found/,
    );
    expect(await status(runId)).toBe("WAITING");
    expect((await (await store()).getWaitpoint(gate.id))!.status).toBe(
      "PENDING",
    );
  });
});

describe("a step's waitpoint", () => {
  it("is reused by a retry, which resumes on the first attempt's URL", async () => {
    suite.define("wf-retried", [["retried", "retried"]], {
      stepFields: { retried: { retry: RETRY } },
    });
    const fired = await fire(suite.service, "wf-retried");
    expect(fired.status).toBe("WAITING");
    const runId = fired.runId!;
    const { first, second } = json<{
      first: { id: string; url: string };
      second: { id: string; url: string };
    }>((await steps(runId)).retried!.output);
    expect(second).toEqual(first);
    expect(await rows(runId)).toEqual([{ id: first.id, status: "PENDING" }]);
    expect(
      await suite.service.resumeWaitpointByToken(tokenOf(first.url), {
        body: { from: "first" },
      }),
    ).toEqual({ status: "resumed" });
    await settles(suite.service, runId, "SUCCEEDED");
    expect(json((await steps(runId)).retried!.output)).toEqual({
      body: { from: "first" },
    });
  });

  it("is consumed when its resume came before the step paused", async () => {
    const { flag, release } = suite.latch("early");
    suite.define("wf-early", [["early", "early", { flag }]]);
    const firing = fire(suite.service, "wf-early");
    const early = await vi.waitFor(async () => {
      const row = await suite.db
        .selectFrom("waitpoint")
        .select(["id", "run_id"])
        .where("workflow_id", "=", "wf-early")
        .executeTakeFirst();
      expect(row).toBeDefined();
      return row!;
    }, POLL);
    await suite.service.resolveWaitpoint(early.id, { approved: true }, CTX);
    await release();
    const runId = (await firing).runId!;
    expect(runId).toBe(early.run_id);
    await settles(suite.service, runId, "SUCCEEDED");
    expect(json((await steps(runId)).early!.output)).toEqual({
      action: "approve",
      same: true,
    });
    expect(await rows(runId)).toEqual([{ id: early.id, status: "CONSUMED" }]);
  });

  it("is new when the step waits again in a later leg", async () => {
    suite.define("wf-again", [["again", "again"]]);
    const runId = (await fire(suite.service, "wf-again")).runId!;
    const first = json<{ id: string; url: string }>(
      (await steps(runId)).again!.output,
    );
    expect(
      await suite.service.resumeWaitpointByToken(tokenOf(first.url), {
        body: { round: 1 },
      }),
    ).toEqual({ status: "resumed" });
    const second = await vi.waitFor(async () => {
      const out = json<{ id: string; url: string } | null>(
        (await steps(runId)).again?.output,
      );
      expect(out?.id).not.toBe(first.id);
      return out!;
    }, POLL);
    await settles(suite.service, runId, "WAITING");
    expect(second.url).not.toBe(first.url);
    expect(await rows(runId)).toEqual([
      { id: first.id, status: "CONSUMED" },
      { id: second.id, status: "PENDING" },
    ]);
    expect(
      await suite.service.resumeWaitpointByToken(tokenOf(second.url), {
        body: { round: 2 },
      }),
    ).toEqual({ status: "resumed" });
    await settles(suite.service, runId, "SUCCEEDED");
    expect(json((await steps(runId)).again!.output)).toEqual({ round: 2 });
  });
});

describe("a waiting run's waitpoints", () => {
  it("closes one a failed step made, and its token is gone", async () => {
    suite.define(
      "wf-flaky",
      [
        ["flaky", "flaky"],
        ["gate", "gate"],
      ],
      {
        edges: [
          ["t1", "flaky", "next"],
          ["flaky", "gate", "error"],
        ],
      },
    );
    const fired = await fire(suite.service, "wf-flaky");
    expect(fired.status).toBe("WAITING");
    const runId = fired.runId!;
    expect(await statuses(runId)).toEqual(["flaky:CANCELLED", "gate:PENDING"]);
    const url = /flaky (\S+)/.exec((await steps(runId)).flaky!.error!)![1]!;
    const token = tokenOf(url);
    expect(await suite.service.describeWaitpointByToken(token)).toMatchObject({
      status: "CANCELLED",
    });
    expect(
      await suite.service.resumeWaitpointByToken(token, { queryParams: {} }),
    ).toEqual({ status: "gone" });
    expect(await status(runId)).toBe("WAITING");

    const gate = await waitpoint(runId, "gate");
    await suite.service.resolveWaitpoint(gate.id, { approved: true }, CTX);
    await settles(suite.service, runId, "SUCCEEDED");
  });

  it("ends the run only when the waitpoint it waits on expires", async () => {
    suite.define("wf-expiry", [
      ["link", "link"],
      ["gate", "gate"],
    ]);
    const runId = (await fire(suite.service, "wf-expiry")).runId!;
    const link = await waitpoint(runId, "link");
    const gate = await waitpoint(runId, "gate");
    // A link a succeeded step made still resumes the run.
    expect(link.status).toBe("PENDING");

    await overdue({ id: link.id });
    const first = await expireDue(runId);
    expect(first.expired.map((w) => w.id)).toEqual([link.id]);
    expect(first.ended).toEqual([]);
    expect(await status(runId)).toBe("WAITING");

    await overdue({ id: gate.id });
    const second = await expireDue(runId);
    expect(second.ended.map((end) => end.runId)).toEqual([runId]);
    const run = await runOf(suite.service, runId);
    expect(run.status).toBe("CANCELLED");
    expect(run.error_name).toBe("WaitpointExpired");
    expect((await steps(runId)).gate?.status).toBe("FAILED");
  });

  it("does not let an expiry cancel a run a resume was delivered to", async () => {
    suite.define("wf-race", [["gate", "gate"]]);
    const runId = (await fire(suite.service, "wf-race")).runId!;
    const gate = await waitpoint(runId, "gate");
    // A resume landed, but the run has not re-entered yet.
    await suite.db
      .updateTable("waitpoint")
      .set({ status: "COMPLETED", resume_payload: "{}" })
      .where("id", "=", gate.id)
      .execute();
    const other = (await (await store()).getWaitpoint(gate.id))!;
    const otherId = "00000000-0000-4000-8000-00000000aaaa";
    await (
      await store()
    ).createWaitpoint({
      ...other,
      id: otherId,
      step_path: "other",
      status: "PENDING",
      token_hash: null,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    await suite.db
      .updateTable("run")
      .set({ waiting_on: otherId })
      .where("id", "=", runId)
      .execute();
    expect((await expireDue(runId)).ended).toEqual([]);
    expect(await status(runId)).toBe("WAITING");
  });
});

describe("an ended run's waitpoints", () => {
  it("close when the orphan sweep fails it, and never resume it", async () => {
    suite.define("wf-orphan", [
      ["link", "link"],
      ["gate", "gate"],
    ]);
    const runId = (await fire(suite.service, "wf-orphan")).runId!;
    const url = json<{ url: string }>((await steps(runId)).link!.output).url;
    const gate = await waitpoint(runId, "gate");
    // Resumed, then the reactor died mid-leg.
    await suite.db
      .updateTable("run")
      .set({ status: "RUNNING" })
      .where("id", "=", runId)
      .execute();
    await (await store()).recoverOrphanedRuns();

    expect(await status(runId)).toBe("FAILED");
    expect(await statuses(runId)).toEqual(["link:CANCELLED", "gate:CANCELLED"]);
    expect((await steps(runId)).gate?.status).toBe("FAILED");
    expect(
      await suite.service.resumeWaitpointByToken(tokenOf(url), {
        queryParams: {},
      }),
    ).toEqual({ status: "gone" });
    await expect(
      suite.service.resolveWaitpoint(gate.id, { approved: true }, CTX),
    ).rejects.toThrow(/CANCELLED/);
  });

  it("refuses a resume on a waitpoint its run's end left open", async () => {
    suite.define("wf-dead", [
      ["link", "link"],
      ["gate", "gate"],
    ]);
    const runId = (await fire(suite.service, "wf-dead")).runId!;
    const url = json<{ url: string }>((await steps(runId)).link!.output).url;
    const gate = await waitpoint(runId, "gate");
    // Ended by a path that predates closing waitpoints.
    await suite.db
      .updateTable("run")
      .set({ status: "FAILED", ended_at: new Date().toISOString() })
      .where("id", "=", runId)
      .execute();

    expect(
      await suite.service.resumeWaitpointByToken(tokenOf(url), {
        queryParams: {},
      }),
    ).toEqual({ status: "gone" });
    expect(
      await suite.service.describeWaitpointByToken(tokenOf(url)),
    ).toMatchObject({ status: "CANCELLED" });
    await expect(
      suite.service.resolveWaitpoint(gate.id, { approved: true }, CTX),
    ).rejects.toThrow(/FAILED run/);
    expect(await statuses(runId)).toEqual(["link:PENDING", "gate:PENDING"]);
  });

  it("ends a WAITING run whose waitpoint closed without ending it", async () => {
    suite.define("wf-stranded", [["gate", "gate"]]);
    const runId = (await fire(suite.service, "wf-stranded")).runId!;
    // A crash between an old expiry claim and the run's cancel.
    await suite.db
      .updateTable("waitpoint")
      .set({ status: "EXPIRED" })
      .where("run_id", "=", runId)
      .execute();
    const ended = await (await store()).endStrandedWaits(100);
    expect(ended.map((end) => end.runId)).toContain(runId);
    const run = await runOf(suite.service, runId);
    expect(run.status).toBe("CANCELLED");
    expect(run.error_name).toBe("WaitpointNotLive");
    expect((await steps(runId)).gate?.status).toBe("FAILED");
  });

  it("answers a held /sync resume when the resumed leg cannot start", async () => {
    suite.define("wf-resume-fail", [["twice", "twice"]]);
    const runId = (await fire(suite.service, "wf-resume-fail")).runId!;
    const urls = json<{ b: string }>((await steps(runId)).twice!.output);
    // The workflow cannot be read when the run resumes.
    const saved = suite.documents.byId.get("wf-resume-fail")!;
    suite.documents.byId.delete("wf-resume-fail");
    try {
      const { status: resumed, reply } =
        await suite.service.resumeWaitpointByTokenSync(
          tokenOf(urls.b),
          { body: {} },
          { timeoutMs: 10_000 },
        );
      expect(resumed).toBe("resumed");
      expect(reply?.status).toBe(409);
      expect(JSON.parse(reply!.body!)).toMatchObject({
        runId,
        status: "FAILED",
      });
    } finally {
      suite.documents.byId.set("wf-resume-fail", saved);
    }
    expect(await status(runId)).toBe("FAILED");
    expect((await steps(runId)).twice?.status).toBe("FAILED");
  });
});

describe("an erased run's waitpoints", () => {
  it("go with the WAITING run, and a racing resume brings nothing back", async () => {
    suite.define("wf-erased", [
      ["approve", "core:approval", { title: "Ship?", body: "Secret plan" }],
      ["after", "echo", { text: "never" }],
    ]);
    const runId = (await fire(suite.service, "wf-erased")).runId!;
    const gate = await waitpoint(runId, "approve");
    expect(gate.approval?.body).toBe("Secret plan");
    const journal = await store();

    const [erased] = await Promise.allSettled([
      journal.eraseRunsForDocuments(["wf-erased"]),
      suite.service.resolveWaitpoint(gate.id, { approved: true }, CTX),
    ]);
    expect(erased.status).toBe("fulfilled");
    // A leg the resume started journals nothing once it ends.
    await expect.poll(() => journal.isRunInFlight(runId), POLL).toBe(false);

    expect(await journal.getRun(runId)).toBeUndefined();
    expect(await journal.getSteps(runId)).toEqual([]);
    expect(await rows(runId)).toEqual([]);
    expect(await journal.heldRunIds()).not.toContain(runId);
  });

  it("leave its resume URL gone", async () => {
    suite.define("wf-erased-link", [["gate", "gate"]]);
    const runId = (await fire(suite.service, "wf-erased-link")).runId!;
    const token = linkToken((await steps(runId)).gate!.output);
    await (await store()).eraseRunsForDocuments(["wf-erased-link"]);

    expect(
      await suite.service.resumeWaitpointByToken(token, resumeBody),
    ).toEqual({ status: "gone" });
    expect(await suite.service.describeWaitpointByToken(token)).toBeUndefined();
    expect(await (await store()).getRun(runId)).toBeUndefined();
  });
});
