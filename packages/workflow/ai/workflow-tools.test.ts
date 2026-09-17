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

  it("getWorkflowPieceBlocks returns pinned block types for a piece's actions and triggers", async () => {
    const { fetchMock, calls } = graphqlFetch({
      Actions: () => ({
        workflowRuntime: {
          pieceActions: {
            actions: [
              {
                name: "send_request",
                displayName: "Send HTTP request",
                description: "d",
                blockType: "@activepieces/piece-http@0.11.19#send_request",
              },
            ],
          },
        },
      }),
      Triggers: () => ({
        workflowRuntime: { pieceTriggers: { triggers: [] } },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = (await tool("getWorkflowPieceBlocks").callback({
      packageName: "@activepieces/piece-http",
    } as never)) as {
      actions: { blockType: string }[];
      triggers: unknown[];
    };
    expect(result.actions[0].blockType).toBe(
      "@activepieces/piece-http@0.11.19#send_request",
    );
    expect(result.triggers).toEqual([]);
    expect(
      calls.every(
        (c) => c.variables.packageName === "@activepieces/piece-http",
      ),
    ).toBe(true);
  });

  it("getWorkflowBlockConfig answers core blocks without touching the runtime", async () => {
    const { fetchMock } = graphqlFetch({});
    vi.stubGlobal("fetch", fetchMock);
    const result = (await tool("getWorkflowBlockConfig").callback({
      blockType: "core#branch",
    } as never)) as {
      kind: string;
      props: { name: string }[];
      ports: string[];
      requiresConnection: boolean;
    };
    expect(result.kind).toBe("step");
    expect(result.props.map((p) => p.name)).toContain("condition");
    expect(result.ports).toEqual(["true", "false"]);
    expect(result.requiresConnection).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
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
      blockType: "@activepieces/piece-http@0.11.19#send_request",
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

  it("getWorkflowBlockConfig reports unknown block types instead of throwing", async () => {
    const { fetchMock } = graphqlFetch({
      Descriptor: () => ({ workflowRuntime: { blockDescriptor: null } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = (await tool("getWorkflowBlockConfig").callback({
      blockType: "@acme/nope@1.0.0#x",
    } as never)) as { error?: string };
    expect(result.error).toMatch(/unknown block type/i);
  });

  it("listWorkflowCoreBlocks lists core blocks by role with expression syntax and graph rules", async () => {
    const result = (await tool("listWorkflowCoreBlocks").callback(
      {} as never,
    )) as {
      blocks: { blockType: string; kind: string }[];
      expressions: string[];
      rules: string[];
    };
    const kind = Object.fromEntries(
      result.blocks.map((b) => [b.blockType, b.kind]),
    );
    expect(kind["core#manual"]).toBe("trigger");
    expect(kind["core#schedule"]).toBe("trigger");
    expect(kind["core#branch"]).toBe("step");
    expect(kind["core#assert"]).toBe("step");
    // The document blocks are a piece now; getWorkflowPieceBlocks lists them.
    expect(Object.keys(kind).some((type) => type.includes("document"))).toBe(
      false,
    );
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
                  blockType: "x",
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

describe("aiTools export", () => {
  it("includes the workflow authoring tools next to the connection tools", async () => {
    const { aiTools } = await import("./tools.js");
    const names = aiTools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "getConnectors",
        "getWorkflowBlockConfig",
        "fireWorkflow",
      ]),
    );
    expect(new Set(names).size).toBe(names.length);
  });
});
