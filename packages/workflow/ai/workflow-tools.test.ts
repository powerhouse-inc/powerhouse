import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as WorkflowToolsModule from "./workflow-tools.js";

vi.mock("@powerhousedao/reactor-browser/ai", () => ({
  resolveDriveSwitchboard: vi.fn(() => ({
    switchboardUrl: "http://localhost:4001",
    graphqlUrl: "http://localhost:4001/graphql",
  })),
}));

type Handler = (variables: Record<string, unknown>) => unknown;

/** Routes GraphQL operations by the operation name in the query text. */
function graphqlFetch(routes: Record<string, Handler>) {
  const calls: { operation: string; variables: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn((_url: string, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    const operation =
      /^\s*(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1] ?? "";
    calls.push({ operation, variables: body.variables });
    const payload =
      operation in routes
        ? { data: routes[operation](body.variables) }
        : { errors: [{ message: `unrouted operation ${operation}` }] };
    return Promise.resolve(
      new Response(JSON.stringify(payload), { status: 200 }),
    );
  });
  return { fetchMock, calls };
}

const CORE = "@powerhousedao/piece-core";
const CORE_VERSION = "6.2.3-dev.27";

// What the reactor serves for the core piece, trimmed to what these tests read.
const CORE_DESCRIPTORS: Record<string, unknown> = {
  branch: {
    displayName: "Core",
    auth: null,
    action: {
      displayName: "Branch",
      requireAuth: false,
      ports: ["true", "false", "error"],
      props: [
        {
          name: "left",
          displayName: "Value",
          type: "SHORT_TEXT",
          required: true,
        },
        {
          name: "operator",
          displayName: "Condition",
          type: "STATIC_DROPDOWN",
          required: true,
        },
      ],
    },
  },
  assert: {
    displayName: "Core",
    auth: null,
    action: { displayName: "Assert", requireAuth: false, props: [] },
  },
  manual: {
    displayName: "Core",
    auth: null,
    trigger: {
      displayName: "Manual",
      requireAuth: false,
      strategy: "MANUAL",
      props: [],
    },
  },
  schedule: {
    displayName: "Core",
    auth: null,
    trigger: {
      displayName: "Schedule",
      requireAuth: false,
      strategy: "POLLING",
      display: "schedule",
      props: [],
    },
  },
};

let tools: typeof WorkflowToolsModule;

beforeEach(async () => {
  vi.resetModules();
  tools = await import("./workflow-tools.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function tool(name: string) {
  const found = tools.workflowTools.find((t) => t.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
}

describe("workflow authoring tools", () => {
  it("declares uniquely named, described tools; only fireWorkflow is a write", () => {
    const names = tools.workflowTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of tools.workflowTools) {
      expect(t.description, t.name).toBeTruthy();
      expect(t.annotations?.readOnlyHint, t.name).toBe(
        t.name !== "fireWorkflow",
      );
      expect(t.annotations?.destructiveHint, t.name).toBe(
        t.name === "fireWorkflow",
      );
    }
  });

  it("getWorkflowPieceBlocks returns the pinned fields of a piece's actions and triggers", async () => {
    const { fetchMock, calls } = graphqlFetch({
      Actions: () => ({
        workflowRuntime: {
          pieceActions: {
            name: "@activepieces/piece-http",
            version: "0.11.19",
            actions: [
              {
                name: "send_request",
                displayName: "Send HTTP request",
                description: "d",
              },
            ],
          },
        },
      }),
      Triggers: () => ({
        workflowRuntime: {
          pieceTriggers: {
            name: "@activepieces/piece-http",
            version: "0.11.19",
            triggers: [],
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = (await tool("getWorkflowPieceBlocks").callback({
      packageName: "@activepieces/piece-http",
    } as never)) as {
      actions: Record<string, string>[];
      triggers: unknown[];
    };
    expect(result.actions[0]).toMatchObject({
      pieceName: "@activepieces/piece-http",
      pieceVersion: "0.11.19",
      actionName: "send_request",
    });
    expect(result.triggers).toEqual([]);
    expect(
      calls.every(
        (c) => c.variables.packageName === "@activepieces/piece-http",
      ),
    ).toBe(true);
  });

  it("getWorkflowBlockConfig reads core blocks from the runtime like any other", async () => {
    const { fetchMock, calls } = graphqlFetch({
      Descriptor: () => ({
        workflowRuntime: { blockDescriptor: CORE_DESCRIPTORS.branch },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = (await tool("getWorkflowBlockConfig").callback({
      pieceName: CORE,
      pieceVersion: CORE_VERSION,
      name: "branch",
      kind: "action",
    } as never)) as {
      actionName: string;
      kind: string;
      title: string;
      props: { name: string }[];
      ports: string[];
      requiresConnection: boolean;
    };
    expect(result.kind).toBe("step");
    expect(result.actionName).toBe("branch");
    expect(result.title).toBe("Branch");
    expect(result.props.map((p) => p.name)).toEqual(["left", "operator"]);
    expect(result.ports).toEqual(["true", "false"]);
    expect(result.requiresConnection).toBe(false);
    expect(calls.map((call) => call.operation)).toEqual(["Descriptor"]);
    expect(calls[0].variables.block).toEqual({
      pieceName: CORE,
      pieceVersion: CORE_VERSION,
      name: "branch",
      kind: "action",
    });
  });

  it("getWorkflowBlockConfig describes a piece block's props, options and connection need", async () => {
    const { fetchMock } = graphqlFetch({
      Descriptor: () => ({
        workflowRuntime: {
          blockDescriptor: {
            displayName: "HTTP",
            auth: null,
            action: {
              displayName: "Send HTTP request",
              requireAuth: false,
              ports: ["next", "error"],
              props: [
                {
                  name: "method",
                  displayName: "Method",
                  type: "STATIC_DROPDOWN",
                  required: true,
                  staticOptions: [{ label: "GET", value: "GET" }],
                },
                {
                  name: "url",
                  displayName: "URL",
                  type: "SHORT_TEXT",
                  required: true,
                },
              ],
            },
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = (await tool("getWorkflowBlockConfig").callback({
      pieceName: "@activepieces/piece-http",
      pieceVersion: "0.11.19",
      name: "send_request",
      kind: "action",
    } as never)) as {
      props: { name: string; required: boolean; options?: unknown[] }[];
      requiresConnection: boolean;
      ports: string[];
    };
    expect(result.requiresConnection).toBe(false);
    expect(result.ports).toEqual(["next"]);
    expect(result.props.map((p) => p.name)).toEqual(["method", "url"]);
    expect(result.props[0].options).toEqual(["GET"]);
  });

  it("getWorkflowBlockConfig reports unknown blocks instead of throwing", async () => {
    const { fetchMock } = graphqlFetch({
      Descriptor: () => ({ workflowRuntime: { blockDescriptor: null } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = (await tool("getWorkflowBlockConfig").callback({
      pieceName: "@acme/nope",
      pieceVersion: "1.0.0",
      name: "x",
      kind: "action",
    } as never)) as { error?: string };
    expect(result.error).toMatch(/unknown block/i);
  });

  it("listWorkflowCoreBlocks lists core blocks by role with expression syntax and graph rules", async () => {
    const entry = (name: string) => ({
      name,
      displayName: name,
      description: "",
      strategy: "MANUAL",
    });
    const { fetchMock } = graphqlFetch({
      Actions: () => ({
        workflowRuntime: {
          pieceActions: {
            name: CORE,
            version: CORE_VERSION,
            actions: ["branch", "assert"].map(entry),
          },
        },
      }),
      Triggers: () => ({
        workflowRuntime: {
          pieceTriggers: {
            name: CORE,
            version: CORE_VERSION,
            triggers: ["manual", "schedule"].map(entry),
          },
        },
      }),
      Descriptor: (variables) => ({
        workflowRuntime: {
          blockDescriptor:
            CORE_DESCRIPTORS[(variables.block as { name: string }).name],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = (await tool("listWorkflowCoreBlocks").callback(
      {} as never,
    )) as {
      blocks: Record<string, string | undefined>[];
      expressions: string[];
      rules: string[];
    };
    const kind = Object.fromEntries(
      result.blocks.map((b): [string, string | undefined] => [
        b.triggerName ?? b.actionName ?? "",
        b.kind,
      ]),
    );
    expect(kind).toEqual({
      manual: "trigger",
      schedule: "trigger",
      branch: "step",
      assert: "step",
    });
    expect(result.blocks[0]).toMatchObject({
      pieceName: CORE,
      pieceVersion: CORE_VERSION,
      triggerName: "manual",
    });
    // The document blocks are a piece; getWorkflowPieceBlocks lists them.
    expect(result.blocks.every((b) => b.pieceName === CORE)).toBe(true);
    expect(result.expressions.join("\n")).toContain("{{steps.<key>.output");
    expect(result.rules.join("\n")).toMatch(/ADD_EDGE/);
  });

  it("listWorkflowRuns returns compact run summaries with per-step outcomes", async () => {
    const { fetchMock, calls } = graphqlFetch({
      Runs: () => ({
        workflowRuntime: {
          runs: [
            {
              id: "r1",
              workflowId: "w1",
              workflowName: "Hello",
              workflowVersion: 3,
              triggerKind: "manual",
              triggerPayload: null,
              status: "FAILED",
              error: "boom",
              startedAt: "t0",
              endedAt: "t1",
              rerunOf: null,
              steps: [
                {
                  stepId: "s",
                  stepKey: "call",
                  pieceName: "@acme/x",
                  blockName: "x",
                  status: "FAILED",
                  input: {},
                  output: null,
                  port: null,
                  error: "HttpError",
                },
              ],
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = (await tool("listWorkflowRuns").callback({
      workflowId: "w1",
      limit: 5,
    } as never)) as {
      runs: {
        id: string;
        status: string;
        error: string | null;
        steps: { key: string; status: string; error: string | null }[];
      }[];
    };
    expect(result.runs[0]).toMatchObject({
      id: "r1",
      status: "FAILED",
      error: "boom",
    });
    expect(result.runs[0].steps).toEqual([
      { key: "call", status: "FAILED", error: "HttpError" },
    ]);
    expect(calls[0].variables).toMatchObject({ workflowId: "w1", limit: 5 });
  });

  it("fireWorkflow sends the payload to the fire mutation and returns the run outcome", async () => {
    const { fetchMock, calls } = graphqlFetch({
      Fire: () => ({
        workflowRuntime: {
          fire: { runId: "r9", status: "SUCCEEDED", error: null },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await tool("fireWorkflow").callback({
      workflowId: "w1",
      payload: { name: "x" },
    } as never);
    expect(result).toMatchObject({ runId: "r9", status: "SUCCEEDED" });
    expect(calls[0].variables).toMatchObject({
      workflowId: "w1",
      payload: { name: "x" },
    });
  });
});
