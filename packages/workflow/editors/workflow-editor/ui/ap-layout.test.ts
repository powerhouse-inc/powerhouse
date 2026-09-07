import { describe, expect, it } from "vitest";
import {
  ADD_BUTTON_SIZE,
  attachableSteps,
  layoutWorkflow,
  STEP_WIDTH,
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
    expect(Math.abs(free!.position.x - centre)).toBeGreaterThan(STEP_WIDTH / 4);
  });

  it("spreads both free branch ports either side of centre", () => {
    const model = branchWith([]);
    const branch = layoutWorkflow(model).nodes.find((n) => n.id === "br")!;
    const centre = branch.position.x + STEP_WIDTH / 2;
    const left = appendFor(model, "true")!.position.x;
    const right = appendFor(model, "false")!.position.x;
    expect(left).toBeLessThan(centre);
    expect(right).toBeGreaterThan(centre);
  });

  it("puts a plain step's button under its centre", () => {
    const plain = model([["t", "a"]]);
    const node = layoutWorkflow(plain).nodes.find((n) => n.id === "a")!;
    const button = layoutWorkflow(plain).nodes.find(
      (n) => n.id === "__append:a:next",
    )!;
    expect(button.position.x + ADD_BUTTON_SIZE / 2).toBeCloseTo(
      node.position.x + STEP_WIDTH / 2,
    );
  });
});

describe("layoutWorkflow branch columns", () => {
  it("keeps a wired port in its own column, not under the card", () => {
    const model = branchWith(["true"]);
    const nodes = layoutWorkflow(model).nodes;
    const branch = nodes.find((n) => n.id === "br")!;
    const child = nodes.find((n) => n.id === "a")!;
    const centre = branch.position.x + STEP_WIDTH / 2;
    // The child sits left of centre, leaving the false column to its right.
    expect(child.position.x + STEP_WIDTH / 2).toBeLessThan(centre);
    expect(
      nodes.find((n) => n.id === "__append:br:false")!.position.x,
    ).toBeGreaterThan(centre);
  });

  it("gives an unwired branch a column each side", () => {
    const nodes = layoutWorkflow(branchWith([])).nodes;
    const branch = nodes.find((n) => n.id === "br")!;
    const centre = branch.position.x + STEP_WIDTH / 2;
    const buttonCentre = (port: string) =>
      nodes.find((n) => n.id === `__append:br:${port}`)!.position.x +
      ADD_BUTTON_SIZE / 2;
    const left = buttonCentre("true");
    const right = buttonCentre("false");
    expect(left).toBeLessThan(centre);
    expect(right).toBeGreaterThan(centre);
    // Even spread either side of the card.
    expect(centre - left).toBeCloseTo(right - centre, 5);
  });
});
