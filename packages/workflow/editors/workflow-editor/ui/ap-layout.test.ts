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

describe("layoutWorkflow append buttons", () => {
  function branchModel(takenPorts: string[]): WorkflowModel {
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

  const appendFor = (model: WorkflowModel, port: string) =>
    layoutWorkflow(model).nodes.find(
      (node) => node.id === `__append:br:${port}`,
    );

  it("keeps a free branch port clear of the taken port's edge", () => {
    const model = branchModel(["true"]);
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
    const model = branchModel([]);
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
