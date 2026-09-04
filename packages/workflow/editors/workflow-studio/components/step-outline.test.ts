import { describe, expect, it } from "vitest";
import { stepOutline, type OutlineStep } from "./step-outline.js";

function step(id: string): OutlineStep {
  return { id, key: id, name: id, blockType: "core#branch" };
}

describe("stepOutline", () => {
  it("walks the graph from the trigger in run order", () => {
    const outline = stepOutline({
      triggerId: "t",
      steps: [step("a"), step("b")],
      edges: [
        { from: "t", to: "a", port: "next" },
        { from: "a", to: "b", port: "next" },
      ],
    });
    expect(outline.rows.map((row) => row.step.id)).toEqual(["a", "b"]);
    expect(outline.rows.map((row) => row.port)).toEqual([null, null]);
    expect(outline.orphans).toEqual([]);
  });

  it("orders branches by port and records the branching port", () => {
    const outline = stepOutline({
      triggerId: "t",
      steps: [step("branch"), step("yes"), step("no"), step("boom")],
      edges: [
        { from: "t", to: "branch", port: "next" },
        { from: "branch", to: "no", port: "false" },
        { from: "branch", to: "boom", port: "error" },
        { from: "branch", to: "yes", port: "true" },
      ],
    });
    expect(outline.rows.map((row) => [row.step.id, row.port])).toEqual([
      ["branch", null],
      ["yes", "true"],
      ["no", "false"],
      ["boom", "error"],
    ]);
  });

  it("reports steps the trigger cannot reach as orphans", () => {
    const outline = stepOutline({
      triggerId: "t",
      steps: [step("a"), step("stray")],
      edges: [{ from: "t", to: "a", port: "next" }],
    });
    expect(outline.rows.map((row) => row.step.id)).toEqual(["a"]);
    expect(outline.orphans.map((s) => s.id)).toEqual(["stray"]);
  });

  it("survives a cycle and a missing trigger", () => {
    const cyclic = stepOutline({
      triggerId: "t",
      steps: [step("a"), step("b")],
      edges: [
        { from: "t", to: "a", port: "next" },
        { from: "a", to: "b", port: "next" },
        { from: "b", to: "a", port: "next" },
      ],
    });
    expect(cyclic.rows.map((row) => row.step.id)).toEqual(["a", "b"]);

    const untriggered = stepOutline({
      triggerId: null,
      steps: [step("a")],
      edges: [],
    });
    expect(untriggered.rows).toEqual([]);
    expect(untriggered.orphans.map((s) => s.id)).toEqual(["a"]);
  });

  it("ignores edges pointing at steps that no longer exist", () => {
    const outline = stepOutline({
      triggerId: "t",
      steps: [step("a")],
      edges: [
        { from: "t", to: "a", port: "next" },
        { from: "a", to: "deleted", port: "next" },
      ],
    });
    expect(outline.rows.map((row) => row.step.id)).toEqual(["a"]);
  });
});
