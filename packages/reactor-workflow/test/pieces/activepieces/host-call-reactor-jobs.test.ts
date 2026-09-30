import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActivepiecesBlockExecutor,
  type PieceStorePort,
  type ReactorPort,
} from "../../../src/pieces/engine/blocks.js";
import { runWorkflow } from "../../../src/pieces/engine/coordinator.js";
import type { WorkflowDefinition } from "../../../src/pieces/engine/types.js";
import type {
  ReactorJobState,
  ReactorSubmission,
} from "../../../src/pieces/activepieces/context/reactor.js";
import type { PieceResolver } from "../../../src/pieces/activepieces/resolver.js";
import { PieceWorker } from "../../../src/pieces/activepieces/worker/host.js";

const PIECE = "@powerhousedao/piece-reactor";

const FIXTURE = `
module.exports = {
  app: {
    displayName: "Reactor Fixture",
    actions: {
      dispatch: {
        name: "dispatch",
        displayName: "Dispatch",
        props: {},
        run: async (ctx) =>
          ctx.reactor.execute({
            documentId: "doc-1",
            actions: [{ type: "FIRST" }, { type: "SECOND" }],
          }),
      },
      twice: {
        name: "twice",
        displayName: "Twice",
        props: {},
        run: async (ctx) => {
          const write = () =>
            ctx.reactor.execute({ documentId: "doc-1", actions: [{ type: "FIRST" }] });
          await write().catch(() => undefined);
          return write();
        },
      },
    },
  },
};
`;

// Short enough that a write holding one call open would fail on it.
const HOST_CALL_CAP_MS = 300;

interface JobScript {
  // How long after submit the job reaches its final state; never if omitted.
  settlesAfterMs?: number;
  final?: (submission: ReactorSubmission) => Omit<ReactorJobState, "jobId">;
  getDelayMs?: number;
  submitDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const applied = (submission: ReactorSubmission) => ({
  status: "READ_READY" as const,
  actions: submission.actionIds.map((actionId) => ({
    actionId,
    kind: "applied" as const,
  })),
});

// Holds each wait as the reactor does: until the job settles or the slice ends.
function scriptedPort(script: JobScript) {
  const waits: number[] = [];
  const calls: string[] = [];
  let submission: ReactorSubmission | undefined;
  let submittedAt = 0;
  const refuse = () => Promise.reject(new Error("not scripted"));
  const port: ReactorPort = {
    models: refuse,
    model: refuse,
    find: refuse,
    create: refuse,
    async submit(input) {
      calls.push(`submit ${input.actions.map((a) => a.type).join(",")}`);
      await sleep(script.submitDelayMs ?? 0);
      submittedAt = Date.now();
      submission = {
        jobId: "job-1",
        actionIds: input.actions.map((_, index) => `action-${index}`),
      };
      return submission;
    },
    async wait(input) {
      waits.push(input.maxWaitMs);
      const settlesAt =
        script.settlesAfterMs === undefined
          ? Number.POSITIVE_INFINITY
          : submittedAt + script.settlesAfterMs;
      const until = Math.min(Date.now() + input.maxWaitMs, settlesAt);
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(until - Date.now(), 0)),
      );
      if (Date.now() < settlesAt || !submission) {
        return { jobId: input.jobId, status: "RUNNING" };
      }
      return {
        jobId: input.jobId,
        ...(script.final ?? applied)(submission),
      };
    },
    async get(input) {
      calls.push(`get ${input.documentId}`);
      await sleep(script.getDelayMs ?? 0);
      return {
        documentId: input.documentId,
        documentType: "acme/todo",
        name: "Written",
        state: { name: "Written" },
      };
    },
  };
  return { port, waits, calls };
}

function memoryStore(): PieceStorePort & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    get: (key, scope) => Promise.resolve(values.get(`${scope}:${key}`)),
    put: (key, value, scope) => {
      values.set(`${scope}:${key}`, value);
      return Promise.resolve();
    },
    delete: (key, scope) => {
      values.delete(`${scope}:${key}`);
      return Promise.resolve();
    },
  };
}

function oneStep(
  timeoutSeconds: number,
  actionName = "dispatch",
): WorkflowDefinition {
  return {
    steps: [
      {
        id: "s1",
        key: "store",
        pieceName: PIECE,
        pieceVersion: "1.0.0",
        actionName,
        config: {},
        timeoutSeconds,
      },
    ],
    edges: [],
  };
}

let dir = "";
let entryPath = "";
let worker: PieceWorker;
// A cap the step's own timeout sits under, as the default does in production.
let roomy: PieceWorker;
const ROOMY_CAP_MS = 5_000;

const resolver: PieceResolver = {
  resolve: ({ name, version }) =>
    Promise.resolve({ name, version, entryPath, local: true }),
};

function run(
  port: ReactorPort,
  timeoutSeconds: number,
  pieceStore?: PieceStorePort,
  on: PieceWorker = worker,
  actionName?: string,
) {
  const executor = new ActivepiecesBlockExecutor({
    cacheDir: dir,
    worker: on,
    resolver,
    reactor: port,
    ...(pieceStore ? { pieceStore } : {}),
  });
  return runWorkflow({
    definition: oneStep(timeoutSeconds, actionName),
    executor,
  });
}

describe("a reactor write that outlasts one host call", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ap-reactor-jobs-"));
    entryPath = join(dir, "piece-reactor.js");
    await writeFile(entryPath, FIXTURE);
    worker = new PieceWorker({ hostCallTimeoutMs: HOST_CALL_CAP_MS });
    roomy = new PieceWorker({ hostCallTimeoutMs: ROOMY_CAP_MS });
    // Spawned and loaded up front, so a short step's budget is its own.
    await run(scriptedPort({ settlesAfterMs: 0 }).port, 10, undefined, roomy);
  });

  afterAll(async () => {
    worker.dispose();
    roomy.dispose();
    await rm(dir, { recursive: true, force: true });
  });

  it("succeeds once the job lands, however many calls that takes", async () => {
    const { port, waits, calls } = scriptedPort({ settlesAfterMs: 1_200 });

    const result = await run(port, 10);

    const [step] = result.steps;
    expect(step.error).toBeUndefined();
    expect(step.status).toBe("SUCCEEDED");
    expect(step.output).toMatchObject({ documentId: "doc-1", name: "Written" });
    expect(calls).toEqual(["submit FIRST,SECOND", "get doc-1"]);
    expect(waits.length).toBeGreaterThan(1);
    for (const wait of waits) expect(wait).toBeLessThan(HOST_CALL_CAP_MS);
  });

  it("records the job it submitted in the step's store", async () => {
    const { port } = scriptedPort({ settlesAfterMs: 0 });
    const store = memoryStore();

    await run(port, 10, store);

    expect(store.values.get("FLOW:reactor.job/store")).toEqual({
      jobId: "job-1",
      actionIds: ["action-0", "action-1"],
    });
  });

  it("fails by name, carrying the job, when the deadline comes first", async () => {
    const { port, calls } = scriptedPort({});

    const result = await run(port, 1);

    const [step] = result.steps;
    expect(step.status).toBe("FAILED");
    expect(step.error).toMatch(/^ReactorJobPendingError: .*job-1.*RUNNING/);
    expect(calls).toEqual(["submit FIRST,SECOND"]);
  });

  it("says a job the reactor lost is unknown, not failed", async () => {
    const { port } = scriptedPort({
      settlesAfterMs: 0,
      final: () => ({ status: "UNKNOWN" }),
    });

    const result = await run(port, 10);

    expect(result.steps[0].error).toMatch(
      /^ReactorJobPendingError: .*job-1 is unknown/,
    );
  });

  it("surfaces the error of a job that failed", async () => {
    const { port, calls } = scriptedPort({
      settlesAfterMs: 0,
      final: () => ({ status: "FAILED", error: "Document is locked" }),
    });

    const result = await run(port, 10);

    const [step] = result.steps;
    expect(step.status).toBe("FAILED");
    expect(step.error).toMatch(
      /^ReactorJobFailedError: .*job-1 failed: Document is locked/,
    );
    expect(calls).not.toContain("get doc-1");
  });

  it("fails a job that landed without every action it was given", async () => {
    const { port, calls } = scriptedPort({
      settlesAfterMs: 0,
      final: (submission) => ({
        status: "READ_READY",
        actions: [
          {
            actionId: submission.actionIds[0],
            kind: "reducer-error",
            message: "name is required",
          },
        ],
      }),
    });

    const result = await run(port, 10);

    const [step] = result.steps;
    expect(step.status).toBe("FAILED");
    expect(step.error).toMatch(/FIRST failed: name is required/);
    expect(step.error).toMatch(/SECOND produced no operation/);
    expect(calls).not.toContain("get doc-1");
  });

  it("reads the document back inside the step's budget, not the cap's", async () => {
    const { port, calls } = scriptedPort({
      settlesAfterMs: 0,
      getDelayMs: ROOMY_CAP_MS,
    });

    const result = await run(port, 1, undefined, roomy);

    const [step] = result.steps;
    expect(step.status).toBe("FAILED");
    expect(step.error).toMatch(
      /^ReactorStateUnreadError: Reactor job job-1 applied its actions/,
    );
    expect(calls).toEqual(["submit FIRST,SECOND", "get doc-1"]);
  });

  it("succeeds when the job lands just before the step stops waiting", async () => {
    const { port } = scriptedPort({ settlesAfterMs: 1_500 });

    const result = await run(port, 2, undefined, roomy);

    expect(result.steps[0].error).toBeUndefined();
    expect(result.steps[0].status).toBe("SUCCEEDED");
  });

  it("submits nothing once the step has stopped waiting", async () => {
    const { port, calls } = scriptedPort({});

    const result = await run(port, 1, undefined, roomy, "twice");

    const [step] = result.steps;
    expect(step.status).toBe("FAILED");
    expect(step.error).toMatch(
      /^ReactorBudgetExhaustedError: .*nothing was submitted/,
    );
    expect(calls).toEqual(["submit FIRST"]);
  });

  it("says a submit that got no answer in time may have been made", async () => {
    const { port } = scriptedPort({
      settlesAfterMs: 0,
      submitDelayMs: ROOMY_CAP_MS,
    });

    const result = await run(port, 1, undefined, roomy);

    const [step] = result.steps;
    expect(step.status).toBe("FAILED");
    expect(step.error).toMatch(
      /^ReactorSubmitUnconfirmedError: .*may have been submitted/,
    );
  });
});
