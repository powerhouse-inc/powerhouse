// The core Delay and Request approval blocks, the waitpoint poller that wakes
// and expires them, and the suspended-runs gauge.
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import {
  CORE,
  CTX,
  fire,
  json,
  POLL,
  runStatus,
  settles,
  stepsOf,
  waitpointRow,
  waitpointSuite,
  type StepSpec,
} from "../../test/helpers/waitpoints.js";
import {
  builtinPiece,
  CORE_PIECE_NAME,
  runBuiltinAction,
} from "../pieces/index.js";
import { WorkflowRunStore, type WorkflowRuntimeDB } from "./store.js";
import { WaitpointPoller } from "./waitpoint-poller.js";

const suite = waitpointSuite();

function workflow(
  id: string,
  steps: StepSpec[],
  policy?: { maxSuspensionDays?: number },
) {
  suite.define(id, steps, { piece: CORE, policy });
}

// Due now, as if its time had passed.
async function backdate(
  relational: IRelationalDb,
  runId: string,
  column: "resume_at" | "expires_at",
) {
  const db =
    await relational.createNamespace<WorkflowRuntimeDB>("workflow_runtime");
  await db
    .updateTable("waitpoint")
    .set({ [column]: new Date(Date.now() - 1000).toISOString() })
    .where("run_id", "=", runId)
    .execute();
}

describe("Delay", () => {
  it("suspends, and the poller resumes it when due", async () => {
    const service = suite.runtime();
    service.startTriggerSupervisor();
    workflow("wf-delay-for", [
      ["wait", "delay", { mode: "for", amount: 1, unit: "seconds" }],
      ["after", "assert", { value: "{{steps.wait.output.resumedAt}}" }],
    ]);
    const started = Date.now();
    const fired = await fire(service, "wf-delay-for");
    expect(fired.status).toBe("WAITING");
    const [waitpoint] = await service.waitpointsForRun(fired.runId!, CTX);
    expect(waitpoint).toMatchObject({ type: "DELAY", kind: "delay" });
    expect(Date.parse(waitpoint!.resumeAt!) - started).toBeGreaterThanOrEqual(
      900,
    );

    const done = await settles(service, fired.runId!, "SUCCEEDED");
    expect(Date.parse(done.ended_at!)).toBeGreaterThanOrEqual(
      Date.parse(waitpoint!.resumeAt!),
    );
    const after = await stepsOf(service, fired.runId!);
    const resumedAt = json<{ resumedAt: string }>(after.wait!.output).resumedAt;
    expect(Date.parse(resumedAt)).toBeGreaterThanOrEqual(
      Date.parse(waitpoint!.resumeAt!),
    );
    expect(json<{ value: string }>(after.after!.output).value).toBe(resumedAt);
  });

  it("wakes waits that came due while no runtime was polling", async () => {
    const db = createFreshRelationalDb();
    const first = suite.runtime(db);
    workflow("wf-delay-until", [
      ["wait", "delay", { mode: "for", amount: 1, unit: "hours" }],
    ]);
    const fired = await fire(first, "wf-delay-until");
    expect(fired.status).toBe("WAITING");
    first.shutdown();
    await backdate(db, fired.runId!, "resume_at");

    const next = suite.runtime(db);
    next.startTriggerSupervisor();
    await settles(next, fired.runId!, "SUCCEEDED");
  });

  it("cancels the run instead of resuming a disabled workflow", async () => {
    const db = createFreshRelationalDb();
    const service = suite.runtime(db);
    workflow("wf-delay-disabled", [
      ["wait", "delay", { mode: "for", amount: 1, unit: "hours" }],
      ["after", "assert", { value: "ran" }],
    ]);
    const fired = await fire(service, "wf-delay-disabled");
    expect(fired.status).toBe("WAITING");
    suite.documents.apply(
      "wf-delay-disabled",
      actions.setWorkflowStatus({ status: "DISABLED" }),
    );
    await backdate(db, fired.runId!, "resume_at");
    service.startTriggerSupervisor();

    const ended = await settles(service, fired.runId!, "CANCELLED");
    expect(ended.error_name).toBe("WorkflowDisabled");
    expect(ended.error).toMatch(/DISABLED/);
    expect(ended.ended_at).not.toBeNull();
    const after = await stepsOf(service, fired.runId!);
    expect(after.wait!.status).toBe("FAILED");
    expect(after.after).toBeUndefined();
    const [waitpoint] = await service.waitpointsForRun(fired.runId!, CTX);
    expect(waitpoint!.status).toBe("CANCELLED");
  });

  it("does not wait for a time already past", async () => {
    workflow("wf-delay-past", [
      ["wait", "delay", { mode: "until", until: "2020-01-01T00:00:00Z" }],
    ]);
    expect((await fire(suite.service, "wf-delay-past")).status).toBe(
      "SUCCEEDED",
    );
  });

  it("refuses a delay longer than maxSuspensionDays", async () => {
    workflow(
      "wf-delay-long",
      [["wait", "delay", { mode: "for", amount: 3, unit: "days" }]],
      { maxSuspensionDays: 2 },
    );
    const fired = await fire(suite.service, "wf-delay-long");
    expect(fired.status).toBe("FAILED");
    expect(fired.error).toMatch(/maxSuspensionDays/);
  });

  it("cannot pause outside a run", async () => {
    await expect(
      runBuiltinAction(builtinPiece(CORE_PIECE_NAME)!, "delay", {
        mode: "for",
        amount: 1,
        unit: "minutes",
      }),
    ).rejects.toThrow(/step test/);
  });
});

const approval = (extra: object = {}) => ({
  title: "Ship {{steps.version.output.value}}?",
  body: "Deploys **{{steps.version.output.value}}** to production.",
  approveLabel: "Ship",
  rejectLabel: "Hold",
  reasonRequiredOn: "reject",
  ...extra,
});

describe("Request approval", () => {
  it("waits for the editor's decision and outputs it", async () => {
    const service = suite.service;
    workflow("wf-approve-editor", [
      ["version", "assert", { value: "v1.2" }],
      ["approve", "approval", approval()],
      ["after", "assert", { value: "{{steps.approve.output.approved}}" }],
    ]);
    const fired = await fire(service, "wf-approve-editor");
    expect(fired.status).toBe("WAITING");
    const [waitpoint] = await service.waitpointsForRun(fired.runId!, CTX);
    expect(waitpoint).toMatchObject({
      type: "WEBHOOK",
      kind: "approval",
      approval: {
        title: "Ship v1.2?",
        body: "Deploys **v1.2** to production.",
        approveLabel: "Ship",
        rejectLabel: "Hold",
        reasonRequiredOn: "reject",
        approvers: [],
      },
    });
    // The workflow's default maxSuspensionDays: 30.
    const expiresIn =
      Date.parse(waitpoint!.expiresAt!) - Date.parse(waitpoint!.createdAt);
    expect(expiresIn).toBe(30 * 86_400_000);
    // No link unless asked for.
    expect(
      json((await stepsOf(service, fired.runId!)).approve!.output),
    ).toEqual({});

    await expect(
      service.resolveWaitpoint(waitpoint!.id, { approved: false }, CTX),
    ).rejects.toThrow(/reason is required/);
    const decided = await service.resolveWaitpoint(
      waitpoint!.id,
      { approved: false, reason: "not on a Friday" },
      CTX,
    );
    await settles(service, fired.runId!, "SUCCEEDED");
    const after = await stepsOf(service, fired.runId!);
    // Stamped when decided, not when the run resumed.
    expect(json(after.approve!.output)).toMatchObject({
      approved: false,
      reason: "not on a Friday",
      decidedBy: "0xabc",
      decidedAt: decided.resolvedAt,
    });
    expect(json<{ value: boolean }>(after.after!.output).value).toBe(false);
  });

  it("lets only its approvers decide, by DID or address", async () => {
    const service = suite.service;
    workflow("wf-approvers", [
      ["version", "assert", { value: "v3" }],
      [
        "approve",
        "approval",
        approval({
          approvers: ["did:pkh:eip155:1:0xDEF"],
          reasonRequiredOn: "both",
        }),
      ],
    ]);
    const fired = await fire(service, "wf-approvers");
    const [waitpoint] = await service.waitpointsForRun(fired.runId!, CTX);
    await expect(
      service.resolveWaitpoint(
        waitpoint!.id,
        { approved: true, reason: "ok" },
        CTX,
      ),
    ).rejects.toThrow(/approvers/);
    const approver = { ...(CTX as object), user: { address: "0xdef" } };
    await expect(
      service.resolveWaitpoint(waitpoint!.id, { approved: true }, approver),
    ).rejects.toThrow(/reason is required/);
    await service.resolveWaitpoint(
      waitpoint!.id,
      { approved: true, reason: "ok" },
      approver as never,
    );
    await settles(service, fired.runId!, "SUCCEEDED");
    expect(
      json((await stepsOf(service, fired.runId!)).approve!.output),
    ).toMatchObject({ approved: true, reason: "ok", decidedBy: "0xdef" });
  });

  it("expires, ending the run CANCELLED", async () => {
    const service = suite.runtime();
    service.startTriggerSupervisor();
    workflow("wf-expire", [
      ["version", "assert", { value: "v4" }],
      [
        "approve",
        "approval",
        approval({ expiresAfter: 1, expiresUnit: "seconds" }),
      ],
    ]);
    const fired = await fire(service, "wf-expire");
    expect(fired.status).toBe("WAITING");
    const ended = await settles(service, fired.runId!, "CANCELLED");
    expect(ended.error_name).toBe("WaitpointExpired");
    expect(ended.error).toMatch(/"approve"/);
    expect(ended.ended_at).not.toBeNull();
    const [waitpoint] = await service.waitpointsForRun(fired.runId!, CTX);
    expect(waitpoint!.status).toBe("EXPIRED");
    expect((await stepsOf(service, fired.runId!)).approve!.status).toBe(
      "FAILED",
    );
    await expect(
      service.resolveWaitpoint(waitpoint!.id, { approved: true }, CTX),
    ).rejects.toThrow(/EXPIRED/);
  });
});

describe("a wait no URL may resume", () => {
  it.each([
    ["approval", ["approve", "approval", approval()]],
    ["delay", ["wait", "delay", { mode: "for", amount: 1, unit: "hours" }]],
  ] as [string, StepSpec][])(
    "gets no token as an %s, and a token on it is refused",
    async (kind, step) => {
      const service = suite.service;
      workflow(`wf-${kind}-token`, [
        ["version", "assert", { value: "v2" }],
        step,
      ]);
      const fired = await fire(service, `wf-${kind}-token`);
      expect(fired.status).toBe("WAITING");
      const [waitpoint] = await service.waitpointsForRun(fired.runId!, CTX);
      const store = (await service.store())!;
      expect((await store.getWaitpoint(waitpoint!.id))!.token_hash).toBeNull();
      // A row holding a token anyway is refused as gone.
      const token = randomBytes(32).toString("base64url");
      await suite.db
        .updateTable("waitpoint")
        .set({ token_hash: createHash("sha256").update(token).digest("hex") })
        .where("id", "=", waitpoint!.id)
        .execute();
      const payload = {
        queryParams: { action: "approve" },
        body: { approved: true },
        headers: {},
      };
      expect(await service.resumeWaitpointByToken(token, payload)).toEqual({
        status: "gone",
      });
      expect(await service.resumeWaitpointByTokenSync(token, payload)).toEqual({
        status: "gone",
      });
      expect(await service.describeWaitpointByToken(token)).toBeUndefined();
      expect((await store.getWaitpoint(waitpoint!.id))!.status).toBe("PENDING");
      expect(await runStatus(service, fired.runId!)).toBe("WAITING");
    },
  );
});

describe("the waitpoint poller", () => {
  it("claims due waits in batches and arms for the next", async () => {
    const relational = createFreshRelationalDb();
    const store = await WorkflowRunStore.create(relational);
    const db =
      await relational.createNamespace<WorkflowRuntimeDB>("workflow_runtime");
    const past = new Date(Date.now() - 1000).toISOString();
    // A waitpoint is created only for a run the journal holds.
    for (const id of [0, 1, 2, 3, 4].map((i) => `due-${i}`).concat("later")) {
      await db
        .insertInto("run")
        .values({
          id,
          workflow_id: "wf",
          workflow_name: "wf",
          workflow_version: 1,
          trigger_kind: "manual",
          trigger_payload: null,
          // Not WAITING: the stub resume never claims, so held runs would repeat.
          status: "RUNNING",
          error: null,
          enqueued_at: past,
          started_at: past,
          ended_at: null,
          rerun_of: null,
          warnings: 0,
          warning_notes: null,
        })
        .execute();
    }
    for (let index = 0; index < 5; index++) {
      await store.createWaitpoint(
        waitpointRow(`due-${index}`, { resume_at: past }),
      );
    }
    await store.createWaitpoint(
      waitpointRow("later", {
        resume_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    const stale = await store.startRun({
      workflowId: "wf",
      workflowName: "wf",
      workflowVersion: 1,
      triggerKind: "manual",
    });
    const wait = waitpointRow(stale, {
      type: "WEBHOOK",
      kind: "webhook",
      expires_at: past,
    });
    await store.createWaitpoint(wait);
    await db
      .updateTable("run")
      .set({ status: "WAITING", waiting_on: wait.id })
      .where("id", "=", stale)
      .execute();
    const resumed: string[] = [];
    const expired: string[] = [];
    const poller = new WaitpointPoller({
      store: () => Promise.resolve(store),
      resume: (runId) => {
        resumed.push(runId);
        return Promise.resolve();
      },
      ended: (end) => {
        expired.push(end.runId);
        return Promise.resolve();
      },
      logger: console,
      batch: 2,
    });
    poller.start();
    await vi.waitFor(
      () => expect(resumed.length + expired.length).toBe(6),
      POLL,
    );
    poller.stop();
    expect(resumed.sort()).toEqual([0, 1, 2, 3, 4].map((i) => `due-${i}`));
    expect(expired).toEqual([stale]);
    expect((await store.getRun(stale))?.status).toBe("CANCELLED");
    expect(await store.nextDelayDue()).toBeDefined();
    expect(await store.nextExpiry()).toBeUndefined();
  });
});

describe("workflow.runs.suspended", () => {
  it("counts the runs waiting", async () => {
    const reader = new PeriodicExportingMetricReader({
      exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
      exportIntervalMillis: 60_000,
    });
    const meters = new MeterProvider({ readers: [reader] });
    const service = suite.runtime(undefined, {
      telemetry: { meter: meters.getMeter("test") },
    });
    workflow("wf-gauge", [
      ["version", "assert", { value: "v5" }],
      [
        "approve",
        "approval",
        approval({ title: "Ok?", reasonRequiredOn: "none" }),
      ],
    ]);
    await fire(service, "wf-gauge");
    await fire(service, "wf-gauge");
    service.startTriggerSupervisor();
    const gauge = async () => {
      const { resourceMetrics } = await reader.collect();
      const metric = resourceMetrics.scopeMetrics
        .flatMap((scope) => scope.metrics)
        .find((m) => m.descriptor.name === "workflow.runs.suspended");
      return (metric?.dataPoints[0]?.value as number | undefined) ?? -1;
    };
    await expect.poll(gauge, POLL).toBe(2);
    service.stopTriggerSupervisor();
    await meters.shutdown();
  });
});
