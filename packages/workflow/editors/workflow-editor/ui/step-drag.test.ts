import { describe, expect, it } from "vitest";
import type { StepModel, WorkflowModel } from "./model.js";
import { canMoveStep, moveRejection } from "./step-drag.js";

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

function model(edges: [string, string, string?][]): WorkflowModel {
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
    edges: edges.map(([from, to, port], index) => ({
      id: `e${index}`,
      from,
      to,
      port: port ?? "next",
      condition: null,
    })),
    variables: [],
  };
}

describe("moveRejection", () => {
  const chain = model([
    ["t", "a"],
    ["a", "b"],
    ["b", "c"],
  ]);

  it("allows moving a step under a later one", () => {
    expect(
      canMoveStep(chain, { stepId: "a", toParentId: "c", port: "next" }),
    ).toBe(false);
    expect(
      canMoveStep(chain, { stepId: "c", toParentId: "a", port: "error" }),
    ).toBe(true);
  });

  it("refuses a step following itself", () => {
    expect(
      moveRejection(chain, { stepId: "a", toParentId: "a", port: "next" }),
    ).toBe("self");
  });

  it("refuses a slot inside the step's own path", () => {
    // a leads to b and c, so neither can become a's parent.
    expect(
      moveRejection(chain, { stepId: "a", toParentId: "b", port: "next" }),
    ).toBe("cycle");
    expect(
      moveRejection(chain, { stepId: "a", toParentId: "c", port: "next" }),
    ).toBe("cycle");
  });

  it("refuses a move that changes nothing", () => {
    expect(
      moveRejection(chain, { stepId: "b", toParentId: "a", port: "next" }),
    ).toBe("already-there");
  });

  it("allows re-parenting a detached step", () => {
    const detached = model([
      ["t", "a"],
      ["a", "b"],
    ]);
    expect(
      canMoveStep(detached, { stepId: "c", toParentId: "b", port: "next" }),
    ).toBe(true);
  });

  it("allows a second edge on a port, since ports fan out", () => {
    const wired = model([
      ["t", "a"],
      ["a", "b"],
    ]);
    expect(
      canMoveStep(wired, { stepId: "c", toParentId: "a", port: "next" }),
    ).toBe(true);
  });
});
