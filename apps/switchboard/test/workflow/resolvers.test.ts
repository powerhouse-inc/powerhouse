// What the workflow subgraph does with the caller behind a request: every
// workflow-scoped field, secrets included, hands it to the runtime, which
// gates secrets on their owner document and creator rather than on admin.
import type { Context } from "@powerhousedao/reactor-api";
import {
  WORKFLOW_SYNCING_MESSAGE,
  WorkflowSyncingError,
  type WorkflowRuntimeService,
} from "@powerhousedao/reactor-workflow";
import { parse, type FieldNode, type OperationDefinitionNode } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { getResolvers } from "../../src/workflow/resolvers.js";

const CTX = {
  headers: {},
  db: {},
  user: { address: "0xadmin" },
} as unknown as Context;

type Resolver = (
  parent: unknown,
  args: unknown,
  ctx: Context,
  info?: unknown,
) => Promise<unknown>;

// The resolve info for the first runtime field of a real query document.
function runsInfo(query: string) {
  const operation = parse(query).definitions[0] as OperationDefinitionNode;
  const root = operation.selectionSet.selections[0] as FieldNode;
  return { fieldNodes: [root.selectionSet!.selections[0] as FieldNode] };
}

const emptyPage = (): Promise<unknown> =>
  Promise.resolve({ records: [], hasNextPage: false, cursor: null });

function waitpointRow(id: string, runId: string) {
  return {
    id,
    run_id: runId,
    workflow_id: "wf-1",
    step_id: "step-1",
    step_key: "step_1",
    step_path: "step-1",
    piece_name: "@powerhousedao/piece-approval",
    block_name: "approval",
    type: "WEBHOOK",
    kind: "approval",
    status: "PENDING",
    created_at: "2026-10-28T00:00:00.000Z",
    resume_at: null,
    expires_at: null,
    resolved_at: null,
    decided_by: null,
    approval: '{"title":"Pay?"}',
  };
}

// The run journal's waitpoint read: one pending approval per run.
function waitpointStore() {
  return {
    listWaitpointsForRuns: vi.fn((runIds: string[]) =>
      Promise.resolve(
        new Map(
          runIds.map((runId) => [runId, [waitpointRow(`wp-${runId}`, runId)]]),
        ),
      ),
    ),
  };
}

function fakeRuntime() {
  return {
    webhookEndpoint: vi.fn(() => Promise.resolve(null)),
    triggerStates: vi.fn(() => Promise.resolve([])),
    runs: vi.fn(() => Promise.resolve([])),
    runsPage: vi.fn(emptyPage),
    run: vi.fn(() => Promise.resolve(null)),
    fire: vi.fn(() => Promise.resolve({})),
    rerun: vi.fn(() => Promise.resolve({})),
    waitingRuns: vi.fn((): Promise<unknown[]> => Promise.resolve([])),
    waitpointsForRun: vi.fn(() => Promise.resolve([{ id: "wp-2" }])),
    store: vi.fn(() => Promise.resolve(waitpointStore())),
    testStep: vi.fn(() => Promise.resolve({})),
    stepOutputTree: vi.fn(() => Promise.resolve({})),
    blockResolutions: vi.fn(() => Promise.resolve([])),
    searchPieces: vi.fn(() =>
      Promise.resolve({ status: "ready", pieces: [], indexedPieces: 0 }),
    ),
    reactorAccessDenial: vi.fn((): string | undefined => undefined),
    testTrigger: vi.fn(() => Promise.resolve(null)),
    cancelTriggerTestFor: vi.fn(() => Promise.resolve(true)),
    createSecret: vi.fn(() => Promise.resolve({ ref: "secret://v1:00" })),
    rotateSecret: vi.fn(() => Promise.resolve({ ref: "secret://v1:00" })),
    deleteSecret: vi.fn(() => Promise.resolve()),
    secretStat: vi.fn(() => Promise.resolve(null)),
    listSecrets: vi.fn(() => Promise.resolve([])),
    canManageSecret: vi.fn(() => Promise.resolve(false)),
    secrets: vi.fn(),
  };
}

function build() {
  const runtime = fakeRuntime();
  const resolvers = getResolvers(
    runtime as unknown as WorkflowRuntimeService,
    undefined,
    undefined,
    (documentId) =>
      documentId === "wf-hidden"
        ? Promise.reject(new Error("You may not read this workflow"))
        : Promise.resolve(),
  ) as Record<string, Record<string, Resolver>>;
  return {
    runtime,
    queries: resolvers.WorkflowRuntimeQueries,
    mutations: resolvers.WorkflowRuntimeMutations,
    secretRecord: resolvers.SecretRecord,
    runRecord: resolvers.WorkflowRunRecord,
  };
}

describe("the workflow resolvers and the caller", () => {
  it("hands the caller to every workflow-scoped field", async () => {
    const { runtime, queries, mutations } = build();

    await queries.webhookEndpoint({}, { workflowId: "wf-1" }, CTX);
    await queries.triggerStates({}, {}, CTX);
    await queries.runs({}, { driveId: "drive-1" }, CTX);
    await queries.run({}, { id: "run-1" }, CTX);
    await mutations.fire({}, { workflowId: "wf-1", payload: { a: 1 } }, CTX);
    await mutations.rerun({}, { runId: "run-1" }, CTX);
    await mutations.testStep({}, { workflowId: "wf-1", stepId: "s1" }, CTX);
    await queries.stepOutputTree({}, { workflowId: "wf-1", stepId: "s1" }, CTX);
    await queries.blockResolutions({}, { workflowId: "wf-1" }, CTX);
    await mutations.testTrigger(
      {},
      { workflowId: "wf-1", payload: { a: 1 }, timeoutSeconds: 30 },
      CTX,
    );
    await mutations.cancelTriggerTest({}, { workflowId: "wf-1" }, CTX);

    expect(runtime.webhookEndpoint).toHaveBeenCalledWith("wf-1", CTX, {});
    expect(runtime.triggerStates).toHaveBeenCalledWith(CTX);
    expect(runtime.runs).toHaveBeenCalledWith(
      { driveId: "drive-1", withStepData: true },
      CTX,
    );
    expect(runtime.run).toHaveBeenCalledWith("run-1", CTX);
    expect(runtime.fire).toHaveBeenCalledWith(
      "wf-1",
      { a: 1 },
      "manual",
      undefined,
      CTX,
    );
    expect(runtime.rerun).toHaveBeenCalledWith("run-1", CTX);
    expect(runtime.testStep).toHaveBeenCalledWith("wf-1", "s1", CTX, {});
    expect(runtime.stepOutputTree).toHaveBeenCalledWith("wf-1", "s1", CTX);
    expect(runtime.blockResolutions).toHaveBeenCalledWith("wf-1", CTX);
    expect(runtime.testTrigger).toHaveBeenCalledWith("wf-1", CTX, {
      payload: { a: 1 },
      timeoutMs: 30_000,
    });
    expect(runtime.cancelTriggerTestFor).toHaveBeenCalledWith("wf-1", CTX);
  });

  it("passes the caller's drive, and tags a still-syncing workflow", async () => {
    const { runtime, queries, mutations } = build();
    const drive = { driveId: "drive-1" };

    await queries.webhookEndpoint({}, { workflowId: "wf-1", ...drive }, CTX);
    await mutations.testTrigger({}, { workflowId: "wf-1", ...drive }, CTX);
    runtime.testStep.mockRejectedValueOnce(new WorkflowSyncingError());
    const syncing = mutations.testStep(
      {},
      { workflowId: "wf-1", stepId: "s1", ...drive },
      CTX,
    );

    expect(runtime.webhookEndpoint).toHaveBeenCalledWith("wf-1", CTX, drive);
    expect(runtime.testTrigger).toHaveBeenCalledWith("wf-1", CTX, drive);
    await expect(syncing).rejects.toMatchObject({
      message: WORKFLOW_SYNCING_MESSAGE,
      extensions: { code: "WORKFLOW_SYNCING", retryable: true },
    });
    expect(runtime.testStep).toHaveBeenCalledWith("wf-1", "s1", CTX, drive);
  });

  it("hands every secret field to the runtime with the caller, never the store", async () => {
    const { runtime, queries, mutations, secretRecord } = build();
    const stat = { ref: "secret://v1:00", ownerId: "conn-1" };

    await mutations.createSecret(
      {},
      { value: "s3cret", documentId: "conn-1" },
      CTX,
    );
    await mutations.rotateSecret({}, { ref: stat.ref, value: "s" }, CTX);
    await expect(
      mutations.deleteSecret({}, { ref: stat.ref }, CTX),
    ).resolves.toBe(true);
    await queries.secret({}, { ref: stat.ref }, CTX);
    await queries.secrets({}, {}, CTX);
    await secretRecord.manageable(stat, {}, CTX);

    expect(runtime.createSecret).toHaveBeenCalledWith(
      { value: "s3cret", label: undefined, ownerId: "conn-1" },
      CTX,
    );
    expect(runtime.rotateSecret).toHaveBeenCalledWith(stat.ref, "s", CTX);
    expect(runtime.deleteSecret).toHaveBeenCalledWith(stat.ref, CTX);
    expect(runtime.secretStat).toHaveBeenCalledWith(stat.ref, CTX);
    expect(runtime.listSecrets).toHaveBeenCalledWith(CTX);
    expect(runtime.canManageSecret).toHaveBeenCalledWith(stat, CTX);
    // Nothing reaches the raw store, whose get returns values.
    expect(runtime.secrets).not.toHaveBeenCalled();
  });

  it("tags a secret minted for a document still syncing", async () => {
    const { runtime, mutations } = build();
    runtime.createSecret.mockRejectedValueOnce(new WorkflowSyncingError());

    await expect(
      mutations.createSecret({}, { value: "s", documentId: "c1" }, CTX),
    ).rejects.toMatchObject({
      extensions: { code: "WORKFLOW_SYNCING", retryable: true },
    });
  });

  it("serves why a workflow got no reactor access, naming the publisher", async () => {
    const { runtime, queries } = build();
    runtime.reactorAccessDenial.mockReturnValueOnce(
      'The publisher 0xabc cannot read reactor connection "conn-1"',
    );

    await expect(
      queries.reactorAccessDenial({}, { workflowId: "wf-1" }, CTX),
    ).resolves.toBe(
      'The publisher 0xabc cannot read reactor connection "conn-1"',
    );
    await expect(
      queries.reactorAccessDenial({}, { workflowId: "wf-1" }, CTX),
    ).resolves.toBeNull();
    await expect(
      queries.reactorAccessDenial({}, { workflowId: "wf-hidden" }, CTX),
    ).rejects.toThrow("You may not read this workflow");
  });

  it("serves the piece version a run's steps ran", async () => {
    const { runtime, queries } = build();
    runtime.run.mockResolvedValueOnce({
      row: { id: "run-1", warnings: 1, trigger_payload: null },
      steps: [
        {
          step_id: "s1",
          input: null,
          output: null,
          piece_version: "2.1.0",
          piece_source: "registry",
          version_match: "fallback",
          version_note:
            "Pinned 3.0.0 is not available; runs 2.1.0 from registry",
        },
      ],
    } as never);

    const run = (await queries.run({}, { id: "run-1" }, CTX)) as {
      warnings: number;
      steps: Record<string, unknown>[];
    };

    expect(run.warnings).toBe(1);
    expect(run.steps[0]).toMatchObject({
      pieceVersion: "2.1.0",
      pieceSource: "registry",
      versionMatch: "fallback",
      versionNote: "Pinned 3.0.0 is not available; runs 2.1.0 from registry",
    });
  });

  it("serves how many iterations a capped run detail holds back", async () => {
    const { runtime, queries } = build();
    runtime.run.mockResolvedValueOnce({
      row: { id: "run-1", warnings: 0, trigger_payload: null },
      steps: [],
      iterationsTotal: 1200,
    } as never);
    const run = (await queries.run({}, { id: "run-1" }, CTX)) as {
      iterationsTotal: number | null;
    };
    expect(run.iterationsTotal).toBe(1200);
  });
});

describe("the runs listing and step data", () => {
  it("reads step blobs only when the query selects them", async () => {
    const { runtime, queries } = build();
    const withData = (query: string) =>
      queries.runs({}, {}, CTX, runsInfo(query)).then(
        () =>
          (runtime.runs.mock.calls.at(-1) as unknown[])[0] as {
            withStepData: boolean;
          },
      );

    expect(
      (await withData("{ workflowRuntime { runs { id status } } }"))
        .withStepData,
    ).toBe(false);
    expect(
      (
        await withData(
          "{ workflowRuntime { runs { id steps { stepId status } } } }",
        )
      ).withStepData,
    ).toBe(false);
    expect(
      (
        await withData(
          "{ workflowRuntime { runs { id steps { stepId output } } } }",
        )
      ).withStepData,
    ).toBe(true);
    // A fragment can select anything, so it reads as asking for the blobs.
    expect(
      (
        await withData(
          "{ workflowRuntime { runs { id steps { ...S } } } } fragment S on WorkflowStepRunRecord { input }",
        )
      ).withStepData,
    ).toBe(true);
  });
});

describe("the runs page", () => {
  it("passes paging through and serves the page", async () => {
    const { runtime, queries } = build();
    runtime.runsPage.mockResolvedValueOnce({
      records: [],
      hasNextPage: true,
      cursor: "next",
    });

    const page = await queries.runsPage(
      {},
      {
        driveId: "drive-1",
        excludeTriggerKinds: ["test"],
        paging: { limit: 10, cursor: "prev" },
      },
      CTX,
      runsInfo(
        "{ workflowRuntime { runsPage { items { id steps { status } } cursor } } }",
      ),
    );

    expect(runtime.runsPage).toHaveBeenCalledWith(
      {
        driveId: "drive-1",
        excludeTriggerKinds: ["test"],
        limit: 10,
        cursor: "prev",
        withStepData: false,
      },
      CTX,
    );
    expect(page).toEqual({
      items: [],
      hasNextPage: true,
      hasPreviousPage: true,
      cursor: "next",
    });
  });

  it("reports a cursor it did not issue as bad input", async () => {
    const { runtime, queries } = build();
    const invalid = new Error("Invalid runs cursor");
    invalid.name = "InvalidRunCursorError";
    runtime.runsPage.mockRejectedValueOnce(invalid);

    const error = (await queries
      .runsPage({}, { paging: { cursor: "junk" } }, CTX)
      .catch((thrown: unknown) => thrown)) as {
      extensions?: { code?: string };
    };
    expect(error.extensions?.code).toBe("BAD_USER_INPUT");
  });
});

describe("piece search", () => {
  it("passes a valid filter through", async () => {
    const { runtime, queries } = build();
    await queries.searchPieces(
      {},
      { query: "send", kind: "trigger", sources: ["registry", "local"] },
      CTX,
    );
    expect(runtime.searchPieces).toHaveBeenCalledWith("send", {
      kind: "trigger",
      sources: ["registry", "local"],
      categories: undefined,
      limit: undefined,
    });
  });

  it("refuses a kind or source it does not know, rather than widen", () => {
    const { runtime, queries } = build();
    expect(() =>
      queries.searchPieces({}, { query: "send", kind: "triggers" }, CTX),
    ).toThrow(/kind is "action" or "trigger"/);
    expect(() =>
      queries.searchPieces(
        {},
        { query: "send", kind: "action", sources: ["Registry"] },
        CTX,
      ),
    ).toThrow(/got Registry/);
    expect(runtime.searchPieces).not.toHaveBeenCalled();
  });
});

describe("waitpoints", () => {
  it("serves waiting runs with the waitpoints the runtime listed", async () => {
    const { runtime, queries, runRecord } = build();
    runtime.waitingRuns.mockResolvedValueOnce([
      {
        run: {
          row: { id: "run-1", status: "WAITING", trigger_payload: null },
          steps: [],
        },
        waitpoints: [{ id: "wp-1" }],
      },
    ]);

    const runs = (await queries.waitingRuns(
      {},
      { driveId: "drive-1", first: 10 },
      CTX,
    )) as { id: string }[];

    expect(runtime.waitingRuns).toHaveBeenCalledWith(
      { driveId: "drive-1", workflowId: undefined, first: 10 },
      CTX,
    );
    expect(await runRecord.waitpoints(runs[0], {}, CTX)).toEqual([
      { id: "wp-1" },
    ]);
    expect(runtime.waitpointsForRun).not.toHaveBeenCalled();
  });

  it("reads the waitpoints of every run in a request with one store call", async () => {
    const { runtime, runRecord } = build();
    const store = waitpointStore();
    runtime.store.mockResolvedValueOnce(store);
    const ctx = { ...CTX } as Context;
    const [first, second, again] = (await Promise.all([
      runRecord.waitpoints({ id: "run-1" }, {}, ctx),
      runRecord.waitpoints({ id: "run-2" }, {}, ctx),
      runRecord.waitpoints({ id: "run-1" }, {}, ctx),
    ])) as Array<Array<{ id: string }>>;

    expect(first).toEqual([
      expect.objectContaining({
        id: "wp-run-1",
        runId: "run-1",
        kind: "approval",
        approval: { title: "Pay?" },
      }),
    ]);
    expect(second!.map((waitpoint) => waitpoint.id)).toEqual(["wp-run-2"]);
    expect(again).toBe(first);
    expect(runtime.store).toHaveBeenCalledTimes(1);
    expect(store.listWaitpointsForRuns).toHaveBeenCalledWith([
      "run-1",
      "run-2",
    ]);
    // The parent resolver served the run; no second run read.
    expect(runtime.waitpointsForRun).not.toHaveBeenCalled();
    expect(runtime.run).not.toHaveBeenCalled();
  });

  it("serves no waitpoints when the run journal is unavailable", async () => {
    const { runtime, runRecord } = build();
    runtime.store.mockResolvedValueOnce(undefined as never);
    expect(await runRecord.waitpoints({ id: "run-9" }, {}, CTX)).toEqual([]);
  });
});
