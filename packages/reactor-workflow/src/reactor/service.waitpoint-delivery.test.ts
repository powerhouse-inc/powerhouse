// A completed waitpoint's delivery: redelivered when lost, once across
// runtimes, `/sync` callers answered when no leg here resumes, the pinned rebuild.
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import type { Operation } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import {
  CTX,
  fire,
  json,
  POLL,
  runStatus,
  settles,
  stepsOf,
  tokenOf,
  waitpointSuite,
  type StepSpec,
} from "../../test/helpers/waitpoints.js";
import type { WorkflowRuntimeService } from "./service.js";
import type { WorkflowRunStore, WorkflowRuntimeDB } from "./store.js";

const MAX_ISO = "9999-12-31T23:59:59.999Z";

const suite = waitpointSuite();

async function gateToken(service: WorkflowRuntimeService, runId: string) {
  const { url } = json<{ url: string }>(
    (await stepsOf(service, runId)).gate!.output,
  );
  return tokenOf(url);
}

async function journalOf(relational: IRelationalDb) {
  return relational.createNamespace<WorkflowRuntimeDB>("workflow_runtime");
}

describe("a completed waitpoint whose delivery was lost", () => {
  it("is redelivered by the next poll, and runs its leg once", async () => {
    const service = suite.runtime();
    service.startTriggerSupervisor();
    suite.define("wf-lost", [
      ["gate", "gate"],
      ["after", "echo", { text: "done" }],
    ]);
    const fired = await fire(service, "wf-lost");
    expect(fired.status).toBe("WAITING");
    const runId = fired.runId!;
    const [waitpoint] = await service.waitpointsForRun(runId, CTX);
    // Completed with no delivery, as when the journal was briefly unreachable.
    const store = (await service.store())!;
    await store.completeWaitpoint(waitpoint!.id, { payload: { body: "x" } });
    expect(await runStatus(service, runId)).toBe("WAITING");

    // The second pass finds the first one's leg in flight.
    await service.pollWaitpointsNow();
    await service.pollWaitpointsNow();
    await vi.waitFor(async () => {
      await service.pollWaitpointsNow();
      expect(await runStatus(service, runId)).toBe("SUCCEEDED");
    }, POLL);
    const after = (await store.getSteps(runId)).filter(
      (row) => row.step_key === "after",
    );
    expect(after).toHaveLength(1);
    expect((await service.waitpointsForRun(runId, CTX))[0]!.status).toBe(
      "CONSUMED",
    );
  });
});

describe("two runtimes polling one journal", () => {
  // Both poll at start and once more, at the same time.
  async function pollBoth(services: WorkflowRuntimeService[]) {
    for (const service of services) service.startTriggerSupervisor();
    await Promise.all(services.map((service) => service.pollWaitpointsNow()));
  }

  async function twoRuntimes() {
    const relational = createFreshRelationalDb();
    const a = suite.runtime(relational);
    const b = suite.runtime(relational);
    // Opened in turn, before any run, so neither open sweeps the other's.
    const stores = [(await a.store())!, (await b.store())!];
    return { relational, services: [a, b], stores };
  }

  function tally<T>(
    stores: WorkflowRunStore[],
    method: "claimDueDelayWaitpoints" | "expireDueWaitpoints",
    count: (result: T) => number,
  ) {
    // Sums what each store's calls returned, read after the polls.
    const spies = stores.map((store) => vi.spyOn(store, method));
    return async () => {
      const results = await Promise.all(
        spies.flatMap((spy) => spy.mock.results.map((r) => r.value as T)),
      );
      return results.reduce((sum, result) => sum + count(result), 0);
    };
  }

  it("resumes a due delay once", async () => {
    const { relational, services, stores } = await twoRuntimes();
    const [a] = services;
    suite.define("wf-two-delay", [
      ["wait", "core:delay", { mode: "for", amount: 1, unit: "hours" }],
      ["after", "echo", { text: "once" }],
    ] as StepSpec[]);
    const fired = await fire(a!, "wf-two-delay");
    expect(fired.status).toBe("WAITING");
    await (
      await journalOf(relational)
    )
      .updateTable("waitpoint")
      .set({ resume_at: new Date(Date.now() - 1000).toISOString() })
      .where("run_id", "=", fired.runId!)
      .execute();
    const claimed = tally<{ length: number }[]>(
      stores,
      "claimDueDelayWaitpoints",
      (rows) => rows.length,
    );

    await pollBoth(services);
    await settles(a!, fired.runId!, "SUCCEEDED");

    expect(await claimed()).toBe(1);
    const after = (await stores[0]!.getSteps(fired.runId!)).filter(
      (row) => row.step_key === "after",
    );
    expect(after).toHaveLength(1);
  });

  it("expires a wait and cancels its run once", async () => {
    const { relational, services, stores } = await twoRuntimes();
    const [a] = services;
    suite.define("wf-two-expiry", [
      ["approve", "core:approval", { title: "Ok?" }],
    ]);
    const fired = await fire(a!, "wf-two-expiry");
    expect(fired.status).toBe("WAITING");
    await (
      await journalOf(relational)
    )
      .updateTable("waitpoint")
      .set({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .where("run_id", "=", fired.runId!)
      .execute();
    const ended = tally<{ ended: { runId: string }[] }>(
      stores,
      "expireDueWaitpoints",
      (swept) => swept.ended.filter((end) => end.runId === fired.runId).length,
    );

    await pollBoth(services);
    const run = await settles(a!, fired.runId!, "CANCELLED");

    expect(run.error_name).toBe("WaitpointExpired");
    expect(await ended()).toBe(1);
    const [waitpoint] = await a!.waitpointsForRun(fired.runId!, CTX);
    expect(waitpoint!.status).toBe("EXPIRED");
  });
});

describe("a /sync resume no leg here will resume", () => {
  it("is answered 503 once the runtime shut down, and resumes on the next", async () => {
    const relational = createFreshRelationalDb();
    const first = suite.runtime(relational);
    suite.define("wf-sync-shutdown", [
      ["gate", "gate"],
      ["after", "echo", { text: "next owner" }],
    ]);
    const fired = await fire(first, "wf-sync-shutdown");
    expect(fired.status).toBe("WAITING");
    const token = await gateToken(first, fired.runId!);
    first.shutdown();

    const { status, reply } = await first.resumeWaitpointByTokenSync(
      token,
      { body: { at: "shutdown" } },
      { timeoutMs: 10_000 },
    );
    expect(status).toBe("resumed");
    expect(reply?.status).toBe(503);
    expect(JSON.parse(reply!.body!)).toMatchObject({
      runId: fired.runId,
      status: "WAITING",
    });

    const next = suite.runtime(relational);
    next.startTriggerSupervisor();
    await settles(next, fired.runId!, "SUCCEEDED");
  });

  it("is answered 409 when another runtime holds the run", async () => {
    const relational = createFreshRelationalDb();
    const service = suite.runtime(relational);
    suite.define("wf-sync-elsewhere", [["gate", "gate"]]);
    const fired = await fire(service, "wf-sync-elsewhere");
    expect(fired.status).toBe("WAITING");
    const token = await gateToken(service, fired.runId!);
    // Claimed by a leg in another process.
    await (
      await journalOf(relational)
    )
      .updateTable("run")
      .set({ status: "RUNNING" })
      .where("id", "=", fired.runId!)
      .execute();

    const { status, reply } = await service.resumeWaitpointByTokenSync(
      token,
      { body: {} },
      { timeoutMs: 10_000 },
    );
    expect(status).toBe("resumed");
    expect(reply?.status).toBe(409);
    expect(JSON.parse(reply!.body!)).toMatchObject({
      runId: fired.runId,
      status: "RUNNING",
    });
  });
});

describe("waitpoint times past year 9999", () => {
  // Long enough that the suspension bound itself lands past 9999.
  const policy = { maxSuspensionDays: 5_000_000 };

  it("refuses a delay until then", async () => {
    suite.define(
      "wf-far-delay",
      [
        [
          "wait",
          "core:delay",
          { mode: "until", until: "+010000-01-01T00:00:00.000Z" },
        ],
      ],
      { policy },
    );
    const fired = await fire(suite.service, "wf-far-delay");
    expect(fired.status).toBe("FAILED");
    expect(fired.error).toContain(MAX_ISO);
  });

  it("caps an expiry there, so the wait is not expired at once", async () => {
    const service = suite.runtime();
    service.startTriggerSupervisor();
    suite.define(
      "wf-far-expiry",
      [
        [
          "approve",
          "core:approval",
          {
            title: "Ok?",
            approveLabel: "Yes",
            rejectLabel: "No",
            reasonRequiredOn: "none",
          },
        ],
      ],
      { policy },
    );
    const fired = await fire(service, "wf-far-expiry");
    expect(fired.status).toBe("WAITING");
    const [waitpoint] = await service.waitpointsForRun(fired.runId!, CTX);
    expect(waitpoint!.expiresAt).toBe(MAX_ISO);
    await service.pollWaitpointsNow();
    expect(await runStatus(service, fired.runId!)).toBe("WAITING");
  });
});

describe("a run resumed on a re-published workflow", () => {
  it("ignores an upgrade snapshot taken after the revision it pinned", async () => {
    suite.define("wf-upgraded", [
      ["gate", "gate"],
      ["after", "echo", { text: "v1" }],
    ]);
    const fired = await fire(suite.service, "wf-upgraded");
    expect(fired.status).toBe("WAITING");
    const runId = fired.runId!;
    const republished = suite.documents.apply(
      "wf-upgraded",
      actions.setStepConfig({ id: "after", config: { text: "v2" } }),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );
    const upgrade = (
      index: number,
      timestampUtcMs: string,
      revision?: Record<string, number>,
    ) =>
      ({
        id: `upgrade-${index}`,
        index,
        skip: 0,
        hash: "",
        timestampUtcMs,
        action: {
          id: `upgrade-${index}`,
          type: "UPGRADE_DOCUMENT",
          scope: "document",
          timestampUtcMs,
          input: {
            model: republished.header.documentType,
            fromVersion: 1,
            toVersion: 2,
            documentId: "wf-upgraded",
            initialState: structuredClone(republished.state),
            ...(revision ? { revision } : {}),
          },
        },
      }) as unknown as Operation;
    // Past the pin by its revision snapshot, and by its timestamp.
    suite.documentOps.set("wf-upgraded", [
      upgrade(1, new Date().toISOString(), {
        global: republished.operations.global.length,
      }),
      upgrade(2, "2999-01-01T00:00:00.000Z"),
    ]);

    const [waitpoint] = await suite.service.waitpointsForRun(runId, CTX);
    await suite.service.resolveWaitpoint(
      waitpoint!.id,
      { approved: true },
      CTX,
    );
    await settles(suite.service, runId, "SUCCEEDED");
    const after = (await stepsOf(suite.service, runId)).after!;
    expect(json(after.output)).toMatchObject({ text: "v1" });
  });
});
