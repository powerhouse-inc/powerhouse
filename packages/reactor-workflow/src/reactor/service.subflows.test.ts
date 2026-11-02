// Sub-flows through Activepieces' own piece, fetched from the CDN or npm and
// skipped offline: Call Flow, Callable Flow and Return Response in one drive.
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import type { OperationWithContext } from "document-model";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fetchBundleForTest } from "../../test/pieces/activepieces/bundle-cache.js";
import { Documents } from "../../test/helpers/documents.js";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import {
  BASE_URL,
  CTX,
  json,
  POLL,
  runOf,
  settles,
  stepsOf,
  webhookDelivery,
} from "../../test/helpers/waitpoints.js";
import { memoryWebhooks } from "../../test/helpers/webhooks.js";
import { CORE_PIECE_NAME, CORE_PIECE_VERSION } from "../pieces/index.js";
import { packagePieces } from "./piece-registry.js";
import type { WorkflowRuntimeService } from "./service.js";

const SUBFLOWS = "@activepieces/piece-subflows";
const SUBFLOWS_VERSION = "0.7.0";
const FIXTURE = "@acme/piece-subflow-steps";
const DRIVE = "drive-1";
const OTHER_DRIVE = "drive-2";
const PUBLISHER = "0x00000000000000000000000000000000000000aa";
// A callable workflow in the drive that neither caller nor publisher reads.
const HIDDEN = "wf-hidden";

const bundleDir = await fetchBundleForTest(SUBFLOWS, SUBFLOWS_VERSION);

const FIXTURE_SOURCE = `
export const steps = {
  displayName: "Sub-flow steps",
  actions: {
    echo: {
      name: "echo",
      displayName: "Echo",
      props: { text: { displayName: "Text", type: "SHORT_TEXT", required: false } },
      run: async (ctx) => ({ text: ctx.propsValue.text ?? null }),
    },
    boom: {
      name: "boom",
      displayName: "Boom",
      props: {},
      run: async () => { throw new Error("the callee always fails"); },
    },
    gate: {
      name: "gate",
      displayName: "Gate",
      props: { open: { displayName: "Open", type: "SHORT_TEXT", required: false } },
      run: async (ctx) => {
        if (ctx.propsValue.open !== "yes") throw new Error("the gate is shut");
        return { open: true };
      },
    },
    stall: {
      name: "stall",
      displayName: "Stall",
      props: {},
      run: () => new Promise((resolve) => setTimeout(resolve, 30_000)),
    },
    probe: {
      name: "probe",
      displayName: "Probe",
      props: {},
      run: async (ctx) => {
        const response = await fetch(ctx.server.apiUrl + "/v1/waitpoints/nope", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "success", data: 1 }),
        });
        return { apiUrl: ctx.server.apiUrl, status: response.status, body: await response.json() };
      },
    },
  },
  triggers: {},
};
`;

type Step = [
  key: string,
  piece: "subflows" | "fixture",
  action: string,
  config?: object,
];

const pieceOf = (piece: Step[1]) =>
  piece === "subflows"
    ? { pieceName: SUBFLOWS, pieceVersion: SUBFLOWS_VERSION }
    : { pieceName: FIXTURE, pieceVersion: "1.0.0" };

const callFlow = (flowId: string, waitForResponse: boolean) => ({
  flowId,
  mode: "simple",
  flowProps: { payload: { n: "{{trigger.payload.n}}" } },
  waitForResponse,
});

describe.skipIf(!bundleDir)("sub-flows", () => {
  const documents = new Documents();
  const drives = new Map<string, string[]>();
  const client = {
    ...documents.client(),
    getIncomingRelationships: (id: string) =>
      Promise.resolve({
        results: [...drives]
          .filter(([, ids]) => ids.includes(id))
          .map(([driveId]) => ({
            header: { id: driveId, documentType: "powerhouse/document-drive" },
          })),
        options: { cursor: "", limit: 0 },
      }),
    // Every workflow is published signed by PUBLISHER.
    getOperations: () =>
      Promise.resolve({
        results: [
          {
            index: 1,
            action: {
              type: "PUBLISH_WORKFLOW",
              context: {
                signer: {
                  user: { address: PUBLISHER },
                  app: { key: "app-key" },
                  signatures: [["sig"]],
                },
              },
            },
          },
        ],
      }),
    isServed: (id: string, options: { subject: { address: string } }) =>
      Promise.resolve(id !== HIDDEN && options.subject.address === PUBLISHER),
    drives: {
      listNodes: (driveId: string) =>
        Promise.resolve({
          results: (drives.get(driveId) ?? []).map((id) => ({
            id,
            name: id,
            kind: "file",
            documentType: "powerhouse/workflow",
          })),
        }),
    },
  };
  let dir = "";
  let service: WorkflowRuntimeService;
  const relationalDb = createFreshRelationalDb();
  let ordinal = 0;

  function define(
    id: string,
    drive: string,
    trigger: "callable" | "manual",
    steps: Step[],
  ) {
    drives.set(drive, [...(drives.get(drive) ?? []), id]);
    return documents.apply(
      id,
      actions.setWorkflowName({ name: `Workflow ${id}` }),
      actions.setTrigger({
        id: "t1",
        ...(trigger === "callable"
          ? {
              pieceName: SUBFLOWS,
              pieceVersion: SUBFLOWS_VERSION,
              triggerName: "callableFlow",
              config: { mode: "simple", exampleData: { sampleData: { n: 1 } } },
            }
          : {
              pieceName: CORE_PIECE_NAME,
              pieceVersion: CORE_PIECE_VERSION,
              triggerName: "manual",
              config: {},
            }),
      } as never),
      ...steps.map(([key, piece, action, config = {}]) =>
        actions.addStep({
          id: key,
          key,
          name: key,
          ...pieceOf(piece),
          actionName: action,
          config,
        } as never),
      ),
      ...steps.map(([key], index) =>
        actions.addEdge({
          id: `e${index}`,
          from: index === 0 ? "t1" : steps[index - 1]![0],
          to: key,
          port: "next",
        }),
      ),
      actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
  }

  // Hands the publish to the runtime, as the read model does, and waits for
  // the Callable Flow trigger to arm.
  async function arm(
    id: string,
    drive: string,
    steps: Step[],
    runtime: WorkflowRuntimeService = service,
  ) {
    const document = define(id, drive, "callable", steps);
    ordinal += 1;
    await runtime.onOperations([
      {
        operation: {
          ...document.operations.global.at(-1)!,
          resultingState: JSON.stringify(document.state.global),
        },
        context: {
          documentId: id,
          documentType: "powerhouse/workflow",
          scope: "global",
          branch: "main",
          ordinal,
        },
      } as unknown as OperationWithContext,
    ]);
    const store = (await runtime.store())!;
    await vi.waitFor(
      async () =>
        expect((await store.getTriggerState(id))?.status).toBe("ENABLED"),
      { timeout: 30_000 },
    );
  }

  const fire = (id: string, payload: unknown = {}) =>
    service.fire(id, payload, "manual", undefined, CTX);

  async function latestRunOf(workflowId: string) {
    let runId = "";
    await vi.waitFor(async () => {
      const runs = await service.runs({ workflowId }, CTX);
      expect(runs.length).toBeGreaterThan(0);
      runId = runs[0]!.row.id;
    }, POLL);
    return runId;
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "rw-subflows-"));
    const entryPath = join(dir, "index.mjs");
    await writeFile(entryPath, FIXTURE_SOURCE);
    packagePieces.setPieces([
      { name: FIXTURE, version: "1.0.0", entryPath },
      {
        name: SUBFLOWS,
        version: SUBFLOWS_VERSION,
        entryPath: join(bundleDir, "src", "index.js"),
      },
    ]);
    service = testRuntime({
      relationalDb,
      reactorClient: client as never,
      waitpointBaseUrl: BASE_URL,
      webhooks: memoryWebhooks().scope,
      assertCanRead: (id: string) =>
        id === HIDDEN
          ? Promise.reject(new Error(`Cannot read ${id}`))
          : Promise.resolve(),
    });
    define(HIDDEN, DRIVE, "callable", [["echo", "fixture", "echo"]]);
    await arm("wf-child", DRIVE, [
      ["double", "fixture", "echo", { text: "{{trigger.payload.data.n}}" }],
      [
        "respond",
        "subflows",
        "returnResponse",
        {
          mode: "simple",
          response: { response: { got: "{{steps.double.output.text}}" } },
        },
      ],
    ]);
    await arm("wf-failing", DRIVE, [["boom", "fixture", "boom"]]);
    await arm("wf-elsewhere", OTHER_DRIVE, [["echo", "fixture", "echo"]]);
  }, 120_000);

  afterAll(async () => {
    service.shutdown();
    packagePieces.reset();
    await rm(dir, { recursive: true, force: true });
  });

  it("lists the callable workflows of the caller's drive its publisher reads", async () => {
    define("wf-lister", DRIVE, "manual", []);
    const { data } = await service.listFlows("wf-lister");
    const byId = Object.fromEntries(data.map((flow) => [flow.id, flow]));
    expect(Object.keys(byId).sort()).toEqual(["wf-child", "wf-failing"]);
    expect(byId["wf-child"]).toMatchObject({
      externalId: "wf-child",
      status: "ENABLED",
      version: {
        displayName: "Workflow wf-child",
        trigger: {
          type: "PIECE_TRIGGER",
          settings: {
            pieceName: SUBFLOWS,
            triggerName: "callableFlow",
            input: { exampleData: { sampleData: { n: 1 } } },
          },
        },
      },
    });
    const named = await service.listFlows("wf-lister", ["wf-failing"]);
    expect(named.data.map((flow) => flow.id)).toEqual(["wf-failing"]);
  });

  it("offers callable workflows in the Flow dropdown at design time", async () => {
    define("wf-designing", DRIVE, "manual", []);
    const output = (await service.blockOptions(
      {
        pieceName: SUBFLOWS,
        pieceVersion: SUBFLOWS_VERSION,
        kind: "action",
        name: "callFlow",
      },
      "flowId",
      {},
      undefined,
      CTX,
      undefined,
      undefined,
      "wf-designing",
    )) as { options: { value: string; label: string }[] };
    expect(
      [...output.options].sort((a, b) => a.value.localeCompare(b.value)),
    ).toEqual([
      { value: "wf-child", label: "Workflow wf-child" },
      { value: "wf-failing", label: "Workflow wf-failing" },
    ]);
  }, 60_000);

  it("lists no workflows, and still answers, when the edited one is unreadable", async () => {
    const output = (await service.blockOptions(
      {
        pieceName: SUBFLOWS,
        pieceVersion: SUBFLOWS_VERSION,
        kind: "action",
        name: "callFlow",
      },
      "flowId",
      {},
      undefined,
      undefined,
      undefined,
      undefined,
      "wf-designing",
    )) as { options: unknown[] };
    expect(output.options).toEqual([]);
  }, 60_000);

  it("calls a workflow and waits for its response", async () => {
    define("wf-caller", DRIVE, "manual", [
      ["call", "subflows", "callFlow", callFlow("wf-child", true)],
      ["after", "fixture", "echo", { text: "{{steps.call.output.data.got}}" }],
    ]);
    const fired = await fire("wf-caller", { n: 7 });
    expect(fired.status).toBe("WAITING");
    const parentId = fired.runId!;
    await settles(service, parentId, "SUCCEEDED");
    const steps = await stepsOf(service, parentId);
    const call = json<{ status: string; data: { got: unknown } }>(
      steps.call?.output,
    );
    expect(call.status).toBe("success");
    expect(String(call.data.got)).toBe("7");
    expect(String(json<{ text: unknown }>(steps.after?.output).text)).toBe("7");

    const childId = await latestRunOf("wf-child");
    const store = (await service.store())!;
    expect((await store.getRunParent(childId))?.runId).toBe(parentId);
    // The callback key onStart kept is dropped once the called run ends.
    await vi.waitFor(async () => {
      expect(
        await store.getPieceStoreValue(
          "FLOW",
          "wf-child",
          `callableFlow_${childId}`,
        ),
      ).toBeNull();
    }, POLL);
  }, 90_000);

  it("calls a workflow without waiting", async () => {
    define("wf-fire-and-forget", DRIVE, "manual", [
      ["call", "subflows", "callFlow", callFlow("wf-child", false)],
    ]);
    const fired = await fire("wf-fire-and-forget", { n: 3 });
    expect(fired.status).toBe("SUCCEEDED");
    const output = json<{ runId: string }>(
      (await stepsOf(service, fired.runId!)).call?.output,
    );
    expect(output.runId).toBeTruthy();
    await settles(service, output.runId, "SUCCEEDED");
    const store = (await service.store())!;
    expect(await store.getRunParent(output.runId)).toEqual({
      runId: fired.runId,
      waitpointId: null,
    });
  }, 90_000);

  it("fails the caller when the called run fails", async () => {
    define("wf-unlucky", DRIVE, "manual", [
      ["call", "subflows", "callFlow", callFlow("wf-failing", true)],
    ]);
    const fired = await fire("wf-unlucky", { n: 1 });
    const parent = await settles(service, fired.runId!, "FAILED");
    expect(parent.error).toContain("the callee always fails");
  }, 90_000);

  it("reruns a failed called run without its caller's spent callback", async () => {
    await arm("wf-gated", DRIVE, [
      ["gate", "fixture", "gate", { open: "no" }],
      [
        "respond",
        "subflows",
        "returnResponse",
        { mode: "simple", response: { response: { ok: true } } },
      ],
    ]);
    define("wf-gate-caller", DRIVE, "manual", [
      ["call", "subflows", "callFlow", callFlow("wf-gated", true)],
    ]);
    const fired = await fire("wf-gate-caller", { n: 1 });
    await settles(service, fired.runId!, "FAILED");
    const childId = await latestRunOf("wf-gated");
    await settles(service, childId, "FAILED");
    documents.apply(
      "wf-gated",
      actions.setStepConfig({ id: "gate", config: { open: "yes" } }),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );
    const rerun = await service.rerun(childId, CTX);
    expect(rerun.status).toBe("SUCCEEDED");
    const steps = await stepsOf(service, rerun.runId!);
    expect(steps.respond?.status).toBe("SUCCEEDED");
    const store = (await service.store())!;
    expect(
      await store.getPieceStoreValue(
        "FLOW",
        "wf-gated",
        `callableFlow_${rerun.runId}`,
      ),
    ).toBeNull();
  }, 90_000);

  it("fails the caller when a stopped reactor's called run is recovered", async () => {
    await arm("wf-stalling", DRIVE, [["stall", "fixture", "stall"]]);
    define("wf-stranded", DRIVE, "manual", [
      ["call", "subflows", "callFlow", callFlow("wf-stalling", true)],
    ]);
    const fired = await fire("wf-stranded", { n: 1 });
    expect(fired.status).toBe("WAITING");
    const childId = await latestRunOf("wf-stalling");
    await settles(service, childId, "RUNNING");
    // A second runtime on the same journal sees the stalled run as orphaned.
    const successor = testRuntime({
      relationalDb,
      reactorClient: client as never,
      waitpointBaseUrl: BASE_URL,
      webhooks: memoryWebhooks().scope,
    });
    try {
      await successor.store();
      const parent = await settles(successor, fired.runId!, "FAILED");
      expect(parent.error).toBeTruthy();
    } finally {
      successor.shutdown();
    }
  }, 90_000);

  it("refuses a callable workflow its publisher cannot read", async () => {
    define("wf-prying", DRIVE, "manual", [
      ["call", "subflows", "callFlow", callFlow(HIDDEN, false)],
    ]);
    const fired = await fire("wf-prying", { n: 1 });
    expect(fired.status).toBe("FAILED");
    expect((await runOf(service, fired.runId!)).error).toContain(
      "Flow not found",
    );
  }, 60_000);

  it("refuses a workflow outside the caller's drive", async () => {
    define("wf-reaching", DRIVE, "manual", [
      ["call", "subflows", "callFlow", callFlow("wf-elsewhere", false)],
    ]);
    const fired = await fire("wf-reaching", { n: 1 });
    expect(fired.status).toBe("FAILED");
    expect((await runOf(service, fired.runId!)).error).toContain(
      "Flow not found",
    );
  }, 60_000);

  it("checks a call's target by its drives, without listing them", async () => {
    define("wf-direct", DRIVE, "manual", []);
    const hostRequest = (target: string) =>
      (
        service as unknown as {
          hostRequest: (
            workflowId: string,
            runId: string | null,
            request: object,
          ) => Promise<{ status: number; body?: string }>;
        }
      ).hostRequest("wf-direct", null, {
        method: "POST",
        path: `/v1/webhooks/${target}`,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: { n: 2 } }),
      });
    const listNodes = vi.spyOn(client.drives, "listNodes");
    try {
      const called = await hostRequest("wf-child");
      expect(called.status).toBe(200);
      expect(json<{ runId: string }>(called.body).runId).toBeTruthy();
      expect((await hostRequest("wf-elsewhere")).status).toBe(404);
      expect((await hostRequest(HIDDEN)).status).toBe(404);
      expect(listNodes).not.toHaveBeenCalled();
    } finally {
      listNodes.mockRestore();
    }
  }, 60_000);

  it("calls and waits on a host with no public endpoint or resume URL", async () => {
    const bare = testRuntime({
      relationalDb: createFreshRelationalDb(),
      reactorClient: client as never,
    });
    try {
      await arm(
        "wf-bare",
        OTHER_DRIVE,
        [
          [
            "respond",
            "subflows",
            "returnResponse",
            { mode: "simple", response: { response: { ok: "yes" } } },
          ],
        ],
        bare,
      );
      const store = (await bare.store())!;
      const row = await store.getTriggerState("wf-bare");
      // Never polled: a poll would run the trigger with no call to read.
      expect(row).toMatchObject({ next_poll_at: null, last_error: null });
      expect(await bare.pollNow("wf-bare", CTX)).toBe(false);

      define("wf-bare-caller", OTHER_DRIVE, "manual", [
        ["call", "subflows", "callFlow", callFlow("wf-bare", true)],
      ]);
      const fired = await bare.fire(
        "wf-bare-caller",
        { n: 1 },
        "manual",
        undefined,
        CTX,
      );
      await settles(bare, fired.runId!, "SUCCEEDED");
      const call = json<{ data: { ok: string } }>(
        (await stepsOf(bare, fired.runId!)).call?.output,
      );
      expect(call.data.ok).toBe("yes");
    } finally {
      bare.shutdown();
    }
  }, 60_000);

  it("refuses a callable workflow's public webhook", async () => {
    const reply = await service.deliverWebhook(
      webhookDelivery("wf-child", { body: { data: {} } }),
    );
    expect(reply.status).toBe(401);
  });

  it("answers a response nothing waits for as discarded", async () => {
    define("wf-probe", DRIVE, "manual", [["probe", "fixture", "probe"]]);
    const fired = await fire("wf-probe");
    expect(fired.status).toBe("SUCCEEDED");
    expect(json((await stepsOf(service, fired.runId!)).probe?.output)).toEqual({
      apiUrl: "http://reactor.invalid",
      status: 200,
      body: { status: "gone", discarded: true },
    });
  }, 60_000);
});
