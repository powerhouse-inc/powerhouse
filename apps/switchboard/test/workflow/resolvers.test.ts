// What the workflow subgraph does with the caller behind a request: every
// workflow-scoped field hands it to the runtime, and secret writes are admins'.
import type {
  Context,
  IAuthorizationService,
} from "@powerhousedao/reactor-api";
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

function fakeRuntime() {
  return {
    webhookEndpoint: vi.fn(() => Promise.resolve(null)),
    triggerStates: vi.fn(() => Promise.resolve([])),
    runs: vi.fn(() => Promise.resolve([])),
    runsPage: vi.fn(emptyPage),
    run: vi.fn(() => Promise.resolve(null)),
    fire: vi.fn(() => Promise.resolve({})),
    rerun: vi.fn(() => Promise.resolve({})),
    testStep: vi.fn(() => Promise.resolve({})),
    stepOutputTree: vi.fn(() => Promise.resolve({})),
    blockResolutions: vi.fn(() => Promise.resolve([])),
    reactorAccessDenial: vi.fn((): string | undefined => undefined),
    testTrigger: vi.fn(() => Promise.resolve(null)),
    cancelTriggerTestFor: vi.fn(() => Promise.resolve(true)),
    secrets: vi.fn(() =>
      Promise.resolve({
        create: vi.fn(() => Promise.resolve({ ref: "secret://v1:00" })),
        rotate: vi.fn(() => Promise.resolve({ ref: "secret://v1:00" })),
        delete: vi.fn(() => Promise.resolve()),
      }),
    ),
  };
}

function build(isAdmin: boolean) {
  const runtime = fakeRuntime();
  const authorizationService = {
    isSupremeAdmin: vi.fn(() => isAdmin),
  } as unknown as IAuthorizationService;
  const resolvers = getResolvers(
    runtime as unknown as WorkflowRuntimeService,
    authorizationService,
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
  };
}

describe("the workflow resolvers and the caller", () => {
  it("hands the caller to every workflow-scoped field", async () => {
    const { runtime, queries, mutations } = build(true);

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
    const { runtime, queries, mutations } = build(true);
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

  it("refuses secret writes to a caller who does not administer the reactor", async () => {
    const { runtime, mutations } = build(false);

    await expect(
      mutations.createSecret({}, { value: "s3cret" }, CTX),
    ).rejects.toThrow("Admin access required");
    await expect(
      mutations.rotateSecret({}, { ref: "secret://v1:00", value: "s" }, CTX),
    ).rejects.toThrow("Admin access required");
    await expect(
      mutations.deleteSecret({}, { ref: "secret://v1:00" }, CTX),
    ).rejects.toThrow("Admin access required");
    // Refused before the store is ever opened.
    expect(runtime.secrets).not.toHaveBeenCalled();
  });

  it("lets an administrator write secrets", async () => {
    const { runtime, mutations } = build(true);

    await mutations.createSecret({}, { value: "s3cret", label: "slack" }, CTX);

    expect(runtime.secrets).toHaveBeenCalledTimes(1);
  });

  it("serves why a workflow got no reactor access, naming the publisher", async () => {
    const { runtime, queries } = build(false);
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
    const { runtime, queries } = build(true);
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
});

describe("the runs listing and step data", () => {
  it("reads step blobs only when the query selects them", async () => {
    const { runtime, queries } = build(false);
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
    const { runtime, queries } = build(false);
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
    const { runtime, queries } = build(false);
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
