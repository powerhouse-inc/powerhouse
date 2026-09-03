import { describe, expect, it } from "vitest";
import { attachableSteps } from "./ap-layout.js";
import type { StepModel, WorkflowModel } from "./model.js";

function step(id: string): StepModel {
  return {
    id,
    key: id,
    name: id,
    blockType: "core#document-dispatch",
    connectionId: null,
    config: {},
    timeoutSeconds: null,
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
