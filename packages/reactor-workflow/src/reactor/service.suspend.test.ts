// Suspend and resume (#3218): a step that waits leaves the run WAITING, and a
// resume re-enters the same run, replaying what it journaled before.
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { describe, expect, it, vi } from "vitest";
import {
  BASE_URL,
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
import {
  buildActionContext,
  RunCannotPauseError,
} from "../pieces/activepieces/context/action.js";

// `legacy` is upstream's V0 run.pause; `shut` fails unless opened.
const ACTIONS = `
    legacy: {
      name: "legacy",
      displayName: "Legacy pause",
      props: {},
      run: async (ctx) => {
        if (ctx.executionType === "BEGIN") {
          ctx.run.pause({ pauseMetadata: { type: "WEBHOOK", response: {} } });
          return {};
        }
        return { resumed: ctx.resumePayload.queryParams.action ?? null };
      },
    },
    foreign: {
      name: "foreign",
      displayName: "Foreign wait",
      props: {},
      run: async (ctx) => {
        ctx.run.waitForWaitpoint("00000000-0000-4000-8000-000000000000");
        return {};
      },
    },
    consume: {
      name: "consume",
      displayName: "Consume",
      props: { attachment: { type: "FILE", required: true, displayName: "File" } },
      run: async (ctx) => ({
        text: Buffer.from(ctx.propsValue.attachment.base64, "base64").toString("utf8"),
      }),
    },
    shut: {
      name: "shut",
      displayName: "Shut",
      props: { open: { displayName: "Open", type: "CHECKBOX", required: false } },
      run: async (ctx) => {
        if (!ctx.propsValue.open) throw new Error("shut");
        return { open: true };
      },
    },
`;

const suite = waitpointSuite({ actions: ACTIONS });

async function store() {
  return (await suite.service.store())!;
}

const status = (runId: string) => runStatus(suite.service, runId);
const steps = (runId: string) => stepsOf(suite.service, runId);

describe("suspend and resume", () => {
  it("waits, resumes from the editor, and replays what ran before", async () => {
    suite.define("wf-editor", [
      ["first", "echo", { text: "hello" }],
      ["gate", "gate"],
      [
        "after",
        "echo",
        { text: "{{steps.first.output.text}}-{{steps.gate.output.approved}}" },
      ],
    ]);
    const fired = await fire(suite.service, "wf-editor");
    expect(fired.status).toBe("WAITING");
    const runId = fired.runId!;
    const run = await runOf(suite.service, runId);
    expect(run.status).toBe("WAITING");
    expect(run.ended_at).toBeNull();
    const pin = await (await store()).getRunPin(runId);
    expect(pin?.definition_hash).toBeTruthy();
    expect(pin?.definition_scope_hash).toBeTruthy();
    const before = await steps(runId);
    expect(before.first?.status).toBe("SUCCEEDED");
    expect(before.gate?.status).toBe("WAITING");
    expect(before.after).toBeUndefined();

    const [waitpoint] = await suite.service.waitpointsForRun(runId, CTX);
    expect(waitpoint).toMatchObject({
      status: "PENDING",
      type: "WEBHOOK",
      stepKey: "gate",
    });
    const waiting = await suite.service.waitingRuns(
      { workflowId: "wf-editor" },
      CTX,
    );
    expect(waiting.map((entry) => entry.run.row.id)).toEqual([runId]);

    const resolved = await suite.service.resolveWaitpoint(
      waitpoint!.id,
      { approved: true, reason: "ok" },
      CTX,
    );
    expect(resolved).toMatchObject({ status: "COMPLETED", decidedBy: "0xabc" });
    await settles(suite.service, runId, "SUCCEEDED");

    const after = await steps(runId);
    // Replayed from the journal, not run again.
    expect(after.first?.output).toBe(before.first?.output);
    expect(json(after.gate!.output)).toEqual({
      action: "approve",
      approved: true,
      body: {
        approved: true,
        reason: "ok",
        decidedBy: "0xabc",
        decidedAt: resolved.resolvedAt,
      },
    });
    expect(json<{ text: string }>(after.after!.output).text).toBe("hello-true");
    expect((await suite.service.waitpointsForRun(runId, CTX))[0]?.status).toBe(
      "CONSUMED",
    );
    // Single use.
    await expect(
      suite.service.resolveWaitpoint(waitpoint!.id, { approved: false }, CTX),
    ).rejects.toThrow(/no longer be resolved/);
    expect(
      await suite.service.waitingRuns({ workflowId: "wf-editor" }, CTX),
    ).toEqual([]);
  });

  it("resumes by token, once, from any of the run's waitpoints", async () => {
    suite.define("wf-token", [
      ["link", "link"],
      ["legacy", "legacy"],
    ]);
    const fired = await fire(suite.service, "wf-token");
    expect(fired.status).toBe("WAITING");
    const runId = fired.runId!;
    const link = json<{ url: string; approve: string; canPause: boolean }>(
      (await steps(runId)).link!.output,
    );
    expect(link.canPause).toBe(true);
    expect(link.url.startsWith(`${BASE_URL}/`)).toBe(true);
    expect(link.approve).toBe(`${link.url}?action=approve`);
    // run.pause names no waitpoint: the host created one for the step.
    expect(
      (await suite.service.waitpointsForRun(runId, CTX)).map((w) => w.stepKey),
    ).toEqual(["link", "legacy"]);

    const token = tokenOf(link.url);
    const described = await suite.service.describeWaitpointByToken(token);
    expect(described).toMatchObject({
      stepName: "link",
      status: "PENDING",
      // Display names from the piece's descriptor.
      actionName: "Link",
      triggerName: "Manual",
    });
    for (const time of ["startedAt", "waitingSince", "expiresAt"] as const) {
      expect(Number.isNaN(Date.parse(described?.[time] ?? ""))).toBe(false);
    }
    expect(
      await suite.service.resumeWaitpointByToken(token, {
        queryParams: { action: "approve" },
      }),
    ).toEqual({ status: "resumed" });
    expect(
      await suite.service.resumeWaitpointByToken(token, { queryParams: {} }),
    ).toEqual({ status: "already" });
    expect(
      await suite.service.resumeWaitpointByToken("nope", { queryParams: {} }),
    ).toEqual({ status: "gone" });

    await settles(suite.service, runId, "SUCCEEDED");
    expect(json((await steps(runId)).legacy!.output)).toEqual({
      resumed: "approve",
    });
    // Resumed through the link, the waiting step's own waitpoint closes.
    const statuses = (await suite.service.waitpointsForRun(runId, CTX)).map(
      (w) => w.status,
    );
    expect(statuses).toEqual(["CONSUMED", "CANCELLED"]);
  });

  it("holds a resume that arrives before the run waits", async () => {
    const { flag, release } = suite.latch("early");
    suite.define("wf-early", [
      ["link", "link"],
      ["hold", "hold", { flag }],
      ["gate", "gate"],
    ]);
    const firing = fire(suite.service, "wf-early");
    const linkRow = await vi.waitFor(async () => {
      const row = await suite.db
        .selectFrom("step_execution")
        .innerJoin("run", "run.id", "step_execution.run_id")
        .select(["step_execution.output", "step_execution.run_id"])
        .where("run.workflow_id", "=", "wf-early")
        .where("step_execution.step_key", "=", "link")
        .executeTakeFirst();
      expect(row).toBeDefined();
      return row!;
    }, POLL);
    const url = json<{ url: string }>(linkRow.output).url;
    expect(await status(linkRow.run_id)).toBe("RUNNING");
    expect(
      await suite.service.resumeWaitpointByToken(tokenOf(url), {
        queryParams: { action: "approve" },
      }),
    ).toEqual({ status: "resumed" });
    await release();

    expect((await firing).status).toBe("WAITING");
    await settles(suite.service, linkRow.run_id, "SUCCEEDED");
    expect(
      json<{ approved: boolean }>((await steps(linkRow.run_id)).gate!.output)
        .approved,
    ).toBe(true);
  });

  it("cancels a WAITING run and refuses a RUNNING one", async () => {
    suite.define("wf-cancel", [["gate", "gate"]]);
    const fired = await fire(suite.service, "wf-cancel");
    const runId = fired.runId!;
    const [waitpoint] = await suite.service.waitpointsForRun(runId, CTX);
    const cancelled = await suite.service.cancelRun(runId, CTX);
    expect(cancelled.row.status).toBe("CANCELLED");
    expect(cancelled.row.ended_at).not.toBeNull();
    expect((await suite.service.waitpointsForRun(runId, CTX))[0]?.status).toBe(
      "CANCELLED",
    );
    // The step it waited on ends with the run.
    const gate = (await steps(runId)).gate!;
    expect(gate.status).toBe("FAILED");
    expect(gate.ended_at).not.toBeNull();
    expect(gate.error).toBe("Cancelled by 0xabc");
    await expect(
      suite.service.resolveWaitpoint(waitpoint!.id, { approved: true }, CTX),
    ).rejects.toThrow(/CANCELLED/);
    await expect(suite.service.cancelRun(runId, CTX)).rejects.toThrow(
      /CANCELLED/,
    );

    const { flag, release } = suite.latch("busy");
    suite.define("wf-busy", [["hold", "hold", { flag }]]);
    const firing = fire(suite.service, "wf-busy");
    const busy = await vi.waitFor(async () => {
      const row = (await (await store()).listRuns("wf-busy")).find(
        (candidate) => candidate.status === "RUNNING",
      );
      expect(row).toBeDefined();
      return row!;
    }, POLL);
    await expect(suite.service.cancelRun(busy.id, CTX)).rejects.toThrow(
      /RUNNING/,
    );
    await release();
    expect((await firing).status).toBe("SUCCEEDED");
  });

  it("leaves WAITING runs to the orphan sweep and retention", async () => {
    suite.define("wf-sweep", [["gate", "gate"]]);
    const { runId } = await fire(suite.service, "wf-sweep");
    const journal = await store();
    await journal.recoverOrphanedRuns();
    await journal.pruneFinishedRuns(
      new Date(Date.now() + 86_400_000).toISOString(),
    );
    expect(await status(runId!)).toBe("WAITING");
    expect(await suite.service.waitpointsForRun(runId!, CTX)).toHaveLength(1);
  });

  it("resumes on the definition it started from", async () => {
    const getOperations = vi.spyOn(suite.client, "getOperations");
    suite.define("wf-pin", [
      ["gate", "gate"],
      ["after", "echo", { text: "v1" }],
    ]);
    const unchanged = await fire(suite.service, "wf-pin");
    const edited = await fire(suite.service, "wf-pin");
    const resolve = async (runId: string) => {
      const [waitpoint] = await suite.service.waitpointsForRun(runId, CTX);
      await suite.service.resolveWaitpoint(
        waitpoint!.id,
        { approved: true },
        CTX,
      );
      await settles(suite.service, runId, "SUCCEEDED");
      return json<{ text: string }>((await steps(runId)).after!.output).text;
    };

    // Same published definition: no rebuild.
    getOperations.mockClear();
    expect(await resolve(unchanged.runId!)).toBe("v1");
    expect(getOperations).not.toHaveBeenCalled();

    // Re-published meanwhile: rebuilt from the operations it pinned.
    suite.documents.apply(
      "wf-pin",
      actions.setStepConfig({ id: "after", config: { text: "v2" } }),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );
    expect(await resolve(edited.runId!)).toBe("v1");
    expect(getOperations).toHaveBeenCalled();
    getOperations.mockRestore();
  });

  it("resumes a SINGLETON run only once the running one is done", async () => {
    const { flag, release } = suite.latch("singleton");
    suite.define(
      "wf-singleton",
      [
        ["gate", "gate"],
        ["nap", "hold", { flag }],
      ],
      { policy: { concurrency: "SINGLETON" } },
    );
    const a = (await fire(suite.service, "wf-singleton")).runId!;
    const b = (await fire(suite.service, "wf-singleton")).runId!;
    const resolve = async (runId: string) => {
      const [waitpoint] = await suite.service.waitpointsForRun(runId, CTX);
      await suite.service.resolveWaitpoint(
        waitpoint!.id,
        { approved: true },
        CTX,
      );
    };
    await resolve(b);
    await settles(suite.service, b, "RUNNING");
    await resolve(a);
    // A waits for B's leg rather than overlapping it.
    expect(await status(a)).toBe("WAITING");
    await release();

    await settles(suite.service, a, "SUCCEEDED");
    const bRun = await runOf(suite.service, b);
    expect(bRun.status).toBe("SUCCEEDED");
    // And is not dropped.
    expect(
      Date.parse((await steps(a)).nap!.started_at!),
    ).toBeGreaterThanOrEqual(Date.parse(bRun.ended_at!));
  });

  it("fails a step that waits on a waitpoint it did not create", async () => {
    suite.define("wf-foreign", [
      ["foreign", "foreign"],
      ["after", "echo", { text: "never" }],
    ]);
    const fired = await fire(suite.service, "wf-foreign");

    expect(fired.status).toBe("FAILED");
    expect(await status(fired.runId!)).toBe("FAILED");
    const journal = await steps(fired.runId!);
    expect(journal.foreign?.status).toBe("FAILED");
    expect(journal.foreign?.error).toMatch(/did not create/);
    expect(journal.after?.status ?? "SKIPPED").toBe("SKIPPED");
  });
});

describe("a rerun of a run that waited", () => {
  it.each([
    [
      "an operator cancelled while WAITING",
      "wf-rerun-cancelled",
      (runId: string) => suite.service.cancelRun(runId, CTX),
    ],
    [
      "its wait's expiry cancelled",
      "wf-rerun-expired",
      async (runId: string) => {
        await suite.db
          .updateTable("waitpoint")
          .set({ expires_at: new Date(Date.now() - 1000).toISOString() })
          .where("run_id", "=", runId)
          .execute();
        await (await store()).expireDueWaitpoints(new Date().toISOString(), 10);
      },
    ],
  ])("is refused for a run %s", async (_, id, end) => {
    suite.define(id, [["gate", "gate"]]);
    const fired = await fire(suite.service, id);
    expect(fired.status).toBe("WAITING");
    await end(fired.runId!);
    expect(await status(fired.runId!)).toBe("CANCELLED");

    await expect(suite.service.rerun(fired.runId!, CTX)).rejects.toThrow(
      /run is CANCELLED/,
    );
  });

  it("replays a decided wait, and runs on from the step that failed", async () => {
    suite.define("wf-rerun-decided", [
      ["gate", "gate"],
      ["check", "shut", { open: false }],
    ]);
    const fired = await fire(suite.service, "wf-rerun-decided");
    const [waitpoint] = await suite.service.waitpointsForRun(fired.runId!, CTX);
    await suite.service.resolveWaitpoint(
      waitpoint!.id,
      { approved: true },
      CTX,
    );
    await settles(suite.service, fired.runId!, "FAILED");
    suite.documents.apply(
      "wf-rerun-decided",
      actions.setStepConfig({ id: "check", config: { open: true } }),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );

    const rerun = await suite.service.rerun(fired.runId!, CTX);

    expect(rerun.status).toBe("SUCCEEDED");
    const journal = await steps(rerun.runId!);
    expect(journal.gate?.status).toBe("REPLAYED");
    expect(json(journal.gate!.output)).toMatchObject({ approved: true });
    expect(await suite.service.waitpointsForRun(rerun.runId!, CTX)).toEqual([]);
  });

  it("waits again on a wait step the run failed in", async () => {
    suite.define("wf-rerun-orphan", [["gate", "gate"]]);
    const fired = await fire(suite.service, "wf-rerun-orphan");
    const [first] = await suite.service.waitpointsForRun(fired.runId!, CTX);
    // Resumed, then the reactor died mid-leg.
    await suite.db
      .updateTable("run")
      .set({ status: "RUNNING" })
      .where("id", "=", fired.runId!)
      .execute();
    await (await store()).recoverOrphanedRuns();
    expect(await status(fired.runId!)).toBe("FAILED");

    const rerun = await suite.service.rerun(fired.runId!, CTX);

    expect(rerun.status).toBe("WAITING");
    const [again] = await suite.service.waitpointsForRun(rerun.runId!, CTX);
    expect(again).toMatchObject({ status: "PENDING", stepKey: "gate" });
    expect(again!.id).not.toBe(first!.id);
    await suite.service.resolveWaitpoint(again!.id, { approved: true }, CTX);
    await settles(suite.service, rerun.runId!, "SUCCEEDED");
  });
});

describe("a resumed leg's documents", () => {
  const REF = "attachment://v1:" + "b".repeat(64);
  const MADE = "doc-made";

  it("reads attachments of documents an earlier leg was handed", async () => {
    const asked: string[][] = [];
    const reader = suite.runtime(undefined, {
      attachments: {
        upload: () => Promise.reject(new Error("no uploads")),
        download: () =>
          Promise.resolve({
            header: { sizeBytes: 4, mimeType: "text/plain", fileName: "a.txt" },
            body: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode("made"));
                controller.close();
              },
            }),
          }),
      },
      canReadAttachmentRef: ({ documentIds }) => {
        asked.push(documentIds);
        return Promise.resolve(documentIds.includes(MADE));
      },
    });
    suite.define("wf-handed", [
      ["gate", "gate"],
      ["read", "consume", { attachment: REF }],
    ]);
    const fired = await fire(reader, "wf-handed");
    expect(fired.status).toBe("WAITING");
    const runId = fired.runId!;
    const journal = (await reader.store())!;
    // What the reactor port records when a first-leg step creates a document.
    await journal.recordRunDocuments(runId, [MADE]);

    const [waitpoint] = await reader.waitpointsForRun(runId, CTX);
    await reader.resolveWaitpoint(waitpoint!.id, { approved: true }, CTX);
    await settles(reader, runId, "SUCCEEDED");

    const read = (await stepsOf(reader, runId)).read!;
    expect(read.error).toBeNull();
    expect(json(read.output)).toEqual({ text: "made" });
    expect(asked.at(-1)).toContain(MADE);
  });
});

describe("ctx.run outside a run", () => {
  it("cannot pause without a waitpoint host", async () => {
    const { context, paused } = buildActionContext({ propsValue: {} });
    expect(context.run.canPause).toBe(false);
    await expect(
      context.run.createWaitpoint({ type: "WEBHOOK" }),
    ).rejects.toThrow(RunCannotPauseError);
    expect(() => context.run.waitForWaitpoint("w")).toThrow(
      RunCannotPauseError,
    );
    expect(paused()).toBeUndefined();
  });
});
