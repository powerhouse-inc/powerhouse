// The router's and the loop's ports on the canvas, in the side panel's checks,
// and a run's loop iterations as the runtime client hands them on.
import { knownPorts } from "@powerhousedao/pieces-framework/workflow";
import { describe, expect, it } from "vitest";
import {
  iterationLabel,
  loopIterations,
} from "../../workflow-studio/components/RunsTable.js";
import { withIterations, type RunRecord } from "../runtime-client.js";
import { layoutWorkflow, portRank } from "./ap-layout.js";
import { contextMenuItems } from "./canvas-menu.js";
import { LOOP_BLOCK, ROUTER_BLOCK, type BlockRef } from "./blocks.js";
import type { StepModel, WorkflowModel } from "./model.js";
import { undeclaredPortIssues } from "./validation.js";

function step(
  id: string,
  block: { pieceName: string; name: string } = {
    pieceName: "@acme/piece",
    name: "act",
  },
  config: unknown = {},
): StepModel {
  return {
    id,
    key: id,
    name: id,
    pieceName: block.pieceName,
    pieceVersion: "1.0.0",
    actionName: block.name,
    connectionId: null,
    config,
    retry: null,
    timeoutSeconds: null,
    idempotencyKeyExpression: null,
    position: null,
  };
}

function model(
  steps: StepModel[],
  edges: [string, string, string][],
): WorkflowModel {
  return {
    name: "wf",
    status: "DRAFT",
    version: 1,
    trigger: {
      id: "t",
      pieceName: "@powerhousedao/piece-core",
      pieceVersion: "1.0.0",
      triggerName: "manual",
      config: {},
      connectionId: null,
    },
    steps,
    edges: edges.map(([from, to, port], index) => ({
      id: `e${index}`,
      from,
      to,
      port,
      condition: null,
    })),
    variables: [],
  };
}

const ports = (block: BlockRef) => knownPorts(block);
const router = step("route", ROUTER_BLOCK, {
  branches: [{ name: "Paid" }, {}],
});
const loop = step("loop", LOOP_BLOCK, { items: "{{trigger.payload.rows}}" });

describe("router on the canvas", () => {
  it("draws a column per branch and otherwise, labelled by branch name", () => {
    const wf = model(
      [router, step("paid")],
      [
        ["t", "route", "next"],
        ["route", "paid", "branch_1"],
      ],
    );
    const { nodes, edges } = layoutWorkflow(wf, ports);
    expect(edges.find((edge) => edge.id === "e1")?.data).toMatchObject({
      port: "branch_1",
      portLabel: "Paid",
      dead: false,
    });
    const appends = nodes
      .filter((node) => node.type === "apAppend")
      .map((node) => node.data as { port: string; portLabel?: string });
    expect(appends).toEqual([
      expect.objectContaining({ port: "branch_2", portLabel: "Branch 2" }),
      expect.objectContaining({ port: "otherwise", portLabel: "Otherwise" }),
      expect.objectContaining({ port: "next" }),
    ]);
    const paid = nodes.find((node) => node.id === "paid")!;
    const others = nodes.filter(
      (node) => node.type === "apAppend" && node.id.includes(":route:"),
    );
    // Branch 1 is the leftmost column.
    for (const other of others) {
      expect(other.position.x).toBeGreaterThan(paid.position.x);
    }
  });

  it("marks an edge on a removed branch as never taken", () => {
    const wf = model(
      [step("route", ROUTER_BLOCK, { branches: [{}] }), step("gone")],
      [
        ["t", "route", "next"],
        ["route", "gone", "branch_2"],
      ],
    );
    const { edges } = layoutWorkflow(wf, ports);
    expect(edges.find((edge) => edge.id === "e1")?.data).toMatchObject({
      dead: true,
    });
    expect(
      undeclaredPortIssues(undefined, ["branch_2"], {
        block: { ...ROUTER_BLOCK, pieceVersion: "1.0.0" },
        config: { branches: [{}] },
      }),
    ).toEqual(['An edge leaves on "branch_2", which this block never takes']);
    expect(
      undeclaredPortIssues(undefined, ["branch_1", "otherwise"], {
        block: { ...ROUTER_BLOCK, pieceVersion: "1.0.0" },
        config: { branches: [{}] },
      }),
    ).toEqual([]);
  });

  it("keeps the wired branches of a router bound to an expression", () => {
    const config = { branches: "{{steps.rules.output}}" };
    const wf = model(
      [step("route", ROUTER_BLOCK, config), step("a"), step("b")],
      [
        ["t", "route", "next"],
        ["route", "a", "branch_1"],
        ["route", "b", "otherwise"],
      ],
    );
    const { edges } = layoutWorkflow(wf, ports);
    expect(edges.find((edge) => edge.id === "e1")?.data).not.toMatchObject({
      dead: true,
    });
    expect(
      undeclaredPortIssues(undefined, ["branch_1", "branch_3", "next"], {
        block: { ...ROUTER_BLOCK, pieceVersion: "1.0.0" },
        config,
      }),
    ).toEqual(['An edge leaves on "next", which this block never takes']);
  });

  it("orders ports: each, next, true, false, branches, otherwise, error", () => {
    const order = [
      "error",
      "otherwise",
      "branch_10",
      "branch_2",
      "false",
      "branch_1",
      "true",
      "next",
      "each",
    ].sort((a, b) => portRank(a) - portRank(b));
    expect(order).toEqual([
      "each",
      "next",
      "true",
      "false",
      "branch_1",
      "branch_2",
      "branch_10",
      "otherwise",
      "error",
    ]);
  });
});

describe("loop on the canvas", () => {
  it("draws the body under each, left of what follows the loop", () => {
    const wf = model(
      [loop, step("body"), step("after")],
      [
        ["t", "loop", "next"],
        ["loop", "body", "each"],
        ["loop", "after", "next"],
      ],
    );
    const { nodes, edges } = layoutWorkflow(wf, ports);
    const x = (id: string) => nodes.find((node) => node.id === id)!.position.x;
    expect(x("body")).toBeLessThan(x("after"));
    expect(
      edges.filter((edge) => edge.type === "apEdge").map((edge) => edge.data),
    ).toEqual([
      expect.objectContaining({ port: "next" }),
      expect.objectContaining({ port: "each", portLabel: "For each item" }),
      expect.objectContaining({ port: "next", portLabel: "After loop" }),
    ]);
    expect(
      contextMenuItems({ kind: "step", id: "loop" }, wf, ports).find(
        (item) => item.id === "addBelow",
      )?.disabled,
    ).toBe(false);
  });
});

describe("loop body frame", () => {
  it("frames the body's steps and buttons, not what follows the loop", () => {
    const wf = model(
      [loop, step("body"), step("more"), step("after")],
      [
        ["t", "loop", "next"],
        ["loop", "body", "each"],
        ["body", "more", "next"],
        ["loop", "after", "next"],
      ],
    );
    const { nodes } = layoutWorkflow(wf, ports);
    const frame = nodes.find((node) => node.id === "__loop:loop")!;
    const { width, height } = frame.data as { width: number; height: number };
    const inside = (id: string) => {
      const { x, y } = nodes.find((node) => node.id === id)!.position;
      return (
        x >= frame.position.x &&
        x <= frame.position.x + width &&
        y >= frame.position.y &&
        y <= frame.position.y + height
      );
    };
    expect(inside("body")).toBe(true);
    expect(inside("more")).toBe(true);
    expect(inside("__append:more:next")).toBe(true);
    expect(inside("loop")).toBe(false);
    expect(inside("after")).toBe(false);
  });
});

describe("loop iterations in a run", () => {
  const row = (stepId: string, path: string | null) => ({
    stepId,
    stepKey: stepId,
    path,
    pieceName: "p",
    blockName: "b",
    status: "SUCCEEDED",
    input: null,
    output: null,
    port: "next",
    error: null,
    errorName: null,
    startedAt: null,
    endedAt: null,
  });
  const run = withIterations({
    steps: [
      row("cell", "outer[1]/inner[1]/cell"),
      row("inner", "outer[1]/inner"),
      row("cell", "outer[2]/inner[1]/cell"),
      row("inner", "outer[2]/inner"),
      row("outer", null),
      row("inner", null),
      row("cell", null),
    ],
  } as unknown as RunRecord);

  it("keeps one row per step and the iterations apart", () => {
    expect(run.steps.map((step) => step.stepId)).toEqual([
      "outer",
      "inner",
      "cell",
    ]);
    expect(run.iterations).toHaveLength(4);
  });

  it("groups iterations under their top-level loop, numbered", () => {
    expect(
      loopIterations(run, "outer").map((step) => iterationLabel(step.path!)),
    ).toEqual(["#1.1", "#1", "#2.1", "#2"]);
    expect(loopIterations(run, "inner")).toEqual([]);
  });
});
