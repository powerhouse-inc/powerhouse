import { describe, expect, it } from "vitest";
import {
  ADD_BUTTON_SIZE,
  attachableSteps,
  layoutWorkflow,
  STEP_HEIGHT,
  STEP_WIDTH,
  VSPACE,
} from "./ap-layout.js";
import type { StepModel, WorkflowModel } from "./model.js";

function step(id: string): StepModel {
  return {
    id,
    key: id,
    name: id,
    blockType: "core#document-dispatch",
    connectionId: null,
    config: {},
    retry: null,
    timeoutSeconds: null,
    idempotencyKeyExpression: null,
    position: null,
  };
}

function model(edges: [string, string][]): WorkflowModel {
  return {
    name: "wf",
    status: "DRAFT",
    version: 1,
    trigger: {
      id: "t",
      blockType: "core#manual",
      config: {},
      connectionId: null,
    },
    steps: [step("a"), step("b"), step("c")],
    edges: edges.map(([from, to], index) => ({
      id: `e${index}`,
      from,
      to,
      port: "next",
      condition: null,
    })),
    variables: [],
  };
}

describe("attachableSteps", () => {
  it("offers only steps unreachable from the trigger", () => {
    const wf = model([
      ["t", "a"],
      ["b", "c"],
    ]);
    expect(attachableSteps(wf, "a").map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("excludes the source step and its descendants' ancestors (no cycles)", () => {
    const wf = model([
      ["t", "a"],
      ["b", "c"],
    ]);
    // From c, b would create a cycle (b already reaches c).
    expect(attachableSteps(wf, "c").map((s) => s.id)).toEqual([]);
    expect(attachableSteps(wf, "b").map((s) => s.id)).toEqual(["c"]);
  });

  it("returns nothing when every step is attached", () => {
    const wf = model([
      ["t", "a"],
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(attachableSteps(wf, "c")).toEqual([]);
  });
});

function branchWith(takenPorts: string[]): WorkflowModel {
  const branch: StepModel = { ...step("br"), blockType: "core#branch" };
  return {
    name: "wf",
    status: "DRAFT",
    version: 1,
    trigger: {
      id: "t",
      blockType: "core#manual",
      config: {},
      connectionId: null,
    },
    steps: [branch, step("a")],
    edges: [
      { id: "e0", from: "t", to: "br", port: "next", condition: null },
      ...takenPorts.map((port, index) => ({
        id: `p${index}`,
        from: "br",
        to: "a",
        port,
        condition: null,
      })),
    ],
    variables: [],
  };
}

describe("layoutWorkflow append buttons", () => {
  const appendFor = (model: WorkflowModel, port: string) =>
    layoutWorkflow(model).nodes.find(
      (node) => node.id === `__append:br:${port}`,
    );

  it("keeps a free branch port clear of the taken port's edge", () => {
    const model = branchWith(["true"]);
    const branch = layoutWorkflow(model).nodes.find((n) => n.id === "br")!;
    const free = appendFor(model, "false");
    expect(appendFor(model, "true")).toBeUndefined();
    // The taken edge runs down the branch's centre, where it draws its own
    // label and insert button, so the free port must not land there.
    const centre = branch.position.x + STEP_WIDTH / 2;
    expect(free).toBeDefined();
    expect(
      Math.abs(free!.position.x + STEP_WIDTH / 2 - centre),
    ).toBeGreaterThan(STEP_WIDTH / 4);
  });
});

describe("layoutWorkflow branch placeholders", () => {
  const node = (
    nodes: { id: string; position: { x: number; y: number } }[],
    id: string,
  ) => nodes.find((n) => n.id === id)!;

  it("puts an unwired port's placeholder where its step would go", () => {
    const model = branchWith(["true"]);
    const nodes = layoutWorkflow(model).nodes;
    const child = node(nodes, "a");
    const free = node(nodes, "__append:br:false");
    // Same row as the wired branch's step, in its own column beside it.
    expect(free.position.y).toBe(child.position.y);
    expect(free.position.x).toBeGreaterThan(child.position.x + STEP_WIDTH);
  });

  it("gives an unwired branch a column each side of the card", () => {
    const nodes = layoutWorkflow(branchWith([])).nodes;
    const centre = node(nodes, "br").position.x + STEP_WIDTH / 2;
    const left = node(nodes, "__append:br:true").position.x + STEP_WIDTH / 2;
    const right = node(nodes, "__append:br:false").position.x + STEP_WIDTH / 2;
    expect(left).toBeLessThan(centre);
    expect(right).toBeGreaterThan(centre);
    expect(centre - left).toBeCloseTo(right - centre, 5);
  });

  it("keeps a plain step's button on the mid-line, not in a column", () => {
    const plain = model([["t", "a"]]);
    const nodes = layoutWorkflow(plain).nodes;
    const step = node(nodes, "a");
    const button = node(nodes, "__append:a:next");
    expect(button.position.x + ADD_BUTTON_SIZE / 2).toBeCloseTo(
      step.position.x + STEP_WIDTH / 2,
    );
    // Halfway to the next row, where the insert affordance lives.
    expect(button.position.y).toBeLessThan(
      step.position.y + STEP_HEIGHT + VSPACE,
    );
  });
});
