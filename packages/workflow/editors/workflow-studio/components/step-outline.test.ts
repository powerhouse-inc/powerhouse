import { describe, expect, it } from "vitest";
import { stepOutline, type OutlineStep } from "./step-outline.js";

function step(id: string): OutlineStep {
  return {
    id,
    key: id,
    name: id,
    pieceName: "@powerhousedao/piece-core",
    pieceVersion: "1.0.0",
    actionName: "branch",
  };
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

  it("runs siblings in steps-array order, not port order", () => {
    const outline = stepOutline({
      triggerId: "t",
      steps: [step("branch"), step("boom"), step("no"), step("yes")],
      edges: [
        { from: "t", to: "branch", port: "next" },
        { from: "branch", to: "yes", port: "true" },
        { from: "branch", to: "no", port: "false" },
        { from: "branch", to: "boom", port: "error" },
      ],
    });
    expect(outline.rows.map((row) => [row.step.id, row.port])).toEqual([
      ["branch", null],
      ["boom", "error"],
      ["no", "false"],
      ["yes", "true"],
    ]);
  });

  it("interleaves branches the way the coordinator's passes do", () => {
    // One pass reaches a, b and c; a2 sits before a, so it waits a pass.
    const outline = stepOutline({
      triggerId: "t",
      steps: [step("a2"), step("a"), step("b"), step("b2")],
      edges: [
        { from: "t", to: "a", port: "next" },
        { from: "t", to: "b", port: "next" },
        { from: "a", to: "a2", port: "next" },
        { from: "b", to: "b2", port: "next" },
      ],
    });
    expect(outline.rows.map((row) => row.step.id)).toEqual([
      "a",
      "b",
      "b2",
      "a2",
    ]);
  });

  it("holds a join until every inbound edge is decided (OR join)", () => {
    const outline = stepOutline({
      triggerId: "t",
      steps: [step("join"), step("branch"), step("yes"), step("no")],
      edges: [
        { from: "t", to: "branch", port: "next" },
        { from: "branch", to: "yes", port: "true" },
        { from: "branch", to: "no", port: "false" },
        { from: "yes", to: "join", port: "next" },
        { from: "no", to: "join", port: "next" },
      ],
    });
    expect(outline.rows.map((row) => row.step.id)).toEqual([
      "branch",
      "yes",
      "no",
      "join",
    ]);
  });

  it("gives a join the port of its first decided inbound edge", () => {
    const outline = stepOutline({
      triggerId: "t",
      steps: [step("branch"), step("fix"), step("done")],
      edges: [
        { from: "t", to: "branch", port: "next" },
        { from: "fix", to: "done", port: "next" },
        { from: "branch", to: "done", port: "true" },
        { from: "branch", to: "fix", port: "false" },
      ],
    });
    expect(outline.rows.map((row) => [row.step.id, row.port])).toEqual([
      ["branch", null],
      ["fix", "false"],
      ["done", "true"],
    ]);
  });

  it("never reaches a step fed by an edge from a missing step", () => {
    const outline = stepOutline({
      triggerId: "t",
      steps: [step("a")],
      edges: [
        { from: "t", to: "a", port: "next" },
        { from: "deleted", to: "a", port: "next" },
      ],
    });
    expect(outline.rows).toEqual([]);
    expect(outline.orphans.map((s) => s.id)).toEqual(["a"]);
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

  it("never runs a cycle, whose steps wait on each other", () => {
    const cyclic = stepOutline({
      triggerId: "t",
      steps: [step("a"), step("b")],
      edges: [
        { from: "t", to: "a", port: "next" },
        { from: "a", to: "b", port: "next" },
        { from: "b", to: "a", port: "next" },
      ],
    });
    expect(cyclic.rows).toEqual([]);
    expect(cyclic.orphans.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("runs steps with no inbound edge as entries only without a trigger", () => {
    const untriggered = stepOutline({
      triggerId: null,
      steps: [step("b"), step("a"), step("c")],
      edges: [{ from: "a", to: "c", port: "next" }],
    });
    expect(untriggered.rows.map((row) => [row.step.id, row.port])).toEqual([
      ["b", null],
      ["a", null],
      ["c", null],
    ]);

    const triggered = stepOutline({
      triggerId: "t",
      steps: [step("a")],
      edges: [],
    });
    expect(triggered.rows).toEqual([]);
    expect(triggered.orphans.map((s) => s.id)).toEqual(["a"]);
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
