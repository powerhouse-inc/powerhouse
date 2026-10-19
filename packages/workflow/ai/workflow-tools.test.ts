import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schemaFetch, type RuntimeRoot } from "../test/runtime-schema.js";
import type * as WorkflowToolsModule from "./workflow-tools.js";

const CORE = "@powerhousedao/piece-core";
const CORE_VERSION = "6.2.3-dev.27";
const HTTP = "@activepieces/piece-http";

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

interface BlockArg {
  pieceName: string;
  pieceVersion: string;
  name: string;
  kind: string;
}

// The tools' requests, executed against the real workflow-runtime schema.
function serve(root: RuntimeRoot) {
  vi.stubGlobal("fetch", schemaFetch(root).fetch);
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

  it("getWorkflowPieceBlocks returns the pinned fields of a piece's actions and triggers", async () => {
    // Only the asked-for package has blocks.
    serve({
      pieceActions: ({ packageName }: { packageName: string }) => ({
        name: packageName,
        version: "0.11.19",
        actions:
          packageName === HTTP
            ? [
                {
                  name: "send_request",
                  displayName: "Send HTTP request",
                  description: "d",
                },
              ]
            : [],
      }),
      pieceTriggers: ({ packageName }: { packageName: string }) => ({
        name: packageName,
        version: "0.11.19",
        triggers: [],
      }),
    });
    const result = (await tool("getWorkflowPieceBlocks").callback({
      packageName: HTTP,
    } as never)) as {
      actions: Record<string, string>[];
      triggers: unknown[];
    };
    expect(result.actions[0]).toMatchObject({
      pieceName: HTTP,
      pieceVersion: "0.11.19",
      actionName: "send_request",
    });
    expect(result.triggers).toEqual([]);
  });

  it("getWorkflowBlockConfig reads core blocks from the runtime like any other", async () => {
    serve({
      blockDescriptor: ({ block }: { block: BlockArg }) =>
        block.pieceName === CORE &&
        block.pieceVersion === CORE_VERSION &&
        block.kind === "action"
          ? CORE_DESCRIPTORS[block.name]
          : null,
    });
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
  });

  it("getWorkflowBlockConfig describes a piece block's props, options and connection need", async () => {
    serve({
      blockDescriptor: () => ({
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
      }),
    });
    const result = (await tool("getWorkflowBlockConfig").callback({
      pieceName: HTTP,
      pieceVersion: "0.11.19",
      name: "send_request",
      kind: "action",
    } as never)) as {
      props: { name: string; required: boolean; options?: unknown[] }[];
      requiresConnection: boolean;
      requireReactor: string | null;
      ports: string[];
    };
    expect(result.requiresConnection).toBe(false);
    expect(result.requireReactor).toBeNull();
    expect(result.ports).toEqual(["next"]);
    expect(result.props.map((p) => p.name)).toEqual(["method", "url"]);
    expect(result.props[0].options).toEqual(["GET"]);
  });

  it("getWorkflowBlockConfig says when a block needs a reactor connection", async () => {
    serve({
      blockDescriptor: () => ({
        displayName: "Docs",
        auth: null,
        action: {
          displayName: "Archive invoice",
          requireAuth: false,
          requireReactor: "write",
          props: [],
        },
      }),
    });
    const result = (await tool("getWorkflowBlockConfig").callback({
      pieceName: "@acme/piece-docs",
      pieceVersion: "1.0.0",
      name: "archive_invoice",
      kind: "action",
    } as never)) as { requireReactor: string | null };
    expect(result.requireReactor).toBe("write");
  });

  it("getWorkflowBlockConfig reports unknown blocks instead of throwing", async () => {
    serve({ blockDescriptor: () => null });
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
    serve({
      pieceActions: ({ packageName }: { packageName: string }) => ({
        name: packageName,
        version: CORE_VERSION,
        actions: packageName === CORE ? ["branch", "assert"].map(entry) : [],
      }),
      pieceTriggers: ({ packageName }: { packageName: string }) => ({
        name: packageName,
        version: CORE_VERSION,
        triggers: packageName === CORE ? ["manual", "schedule"].map(entry) : [],
      }),
      blockDescriptor: ({ block }: { block: BlockArg }) =>
        CORE_DESCRIPTORS[block.name],
    });
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
    expect(result.rules.join("\n")).toMatch(
      /reports requireReactor .* must set reactorConnectionId .* authType REACTOR/,
    );
    // The reducer only snapshots: enabling is its own action.
    expect(result.rules.join("\n")).toContain(
      "dispatch SET_WORKFLOW_STATUS ENABLED after PUBLISH_WORKFLOW",
    );
    expect(result.rules.join("\n")).not.toMatch(
      /snapshots the draft and enables/,
    );
  });

  it("listWorkflowRuns returns compact run summaries with per-step outcomes", async () => {
    const run = {
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
      warningNotes: [],
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
    };
    // Answers only the scope the tool was asked for.
    serve({
      runs: ({ workflowId, limit }: { workflowId?: string; limit?: number }) =>
        workflowId === "w1" && limit === 5 ? [run] : [],
    });
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
  });

  it("fireWorkflow sends the payload to the fire mutation and returns the run outcome", async () => {
    let fired: unknown;
    serve({
      fire: (args: { workflowId: string; payload: unknown }) => {
        fired = args;
        return { runId: "r9", status: "SUCCEEDED", error: null, steps: [] };
      },
    });
    const result = await tool("fireWorkflow").callback({
      workflowId: "w1",
      payload: { name: "x" },
    } as never);
    expect(result).toMatchObject({ runId: "r9", status: "SUCCEEDED" });
    expect(fired).toMatchObject({ workflowId: "w1", payload: { name: "x" } });
  });
});
