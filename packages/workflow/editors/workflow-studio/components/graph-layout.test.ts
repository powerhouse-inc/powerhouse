import { describe, expect, it } from "vitest";
import { graphLayout, TRIGGER_NODE } from "./graph-layout.js";
import type { OutlineEdge, OutlineStep } from "./step-outline.js";

const step = (id: string): OutlineStep => ({
  id,
  key: id,
  name: id,
  pieceName: "p",
  pieceVersion: "1.0.0",
  actionName: "a",
});
const edge = (from: string, to: string, port = "next"): OutlineEdge => ({
  from,
  to,
  port,
});

function place(steps: string[], edges: OutlineEdge[], triggerId = "t") {
  const layout = graphLayout({ triggerId, steps: steps.map(step), edges });
  return {
    layout,
    at: Object.fromEntries(
      layout.nodes.map((n) => [n.step.id, [n.col, n.lane, n.port]]),
    ),
  };
}

describe("graphLayout", () => {
  it("lays a linear workflow on one lane", () => {
    const { layout, at } = place(
      ["a", "b", "c"],
      [edge("t", "a"), edge("a", "b"), edge("b", "c")],
    );
    expect(at).toEqual({
      a: [1, 0, null],
      b: [2, 0, null],
      c: [3, 0, null],
    });
    expect(layout).toMatchObject({ cols: 3, lanes: 1 });
    expect(layout.edges[0].from).toBe(TRIGGER_NODE);
  });

  it("drops the false and error paths to lower lanes", () => {
    const { layout, at } = place(
      ["branch", "yes", "no", "work", "done", "fix"],
      [
        edge("t", "branch"),
        edge("branch", "yes", "true"),
        edge("branch", "no", "false"),
        edge("yes", "work"),
        edge("work", "done"),
        edge("work", "fix", "error"),
      ],
    );
    expect(at).toEqual({
      branch: [1, 0, null],
      yes: [2, 0, "true"],
      no: [2, 1, "false"],
      work: [3, 0, null],
      done: [4, 0, null],
      fix: [4, 1, "error"],
    });
    expect(layout.lanes).toBe(2);
  });

  it("keeps a step's only way out on its lane, whatever its port", () => {
    const { layout, at } = place(
      ["bound", "runnable", "order", "missing"],
      [
        edge("t", "bound"),
        edge("bound", "runnable", "false"),
        edge("runnable", "order"),
        edge("runnable", "missing", "error"),
      ],
    );
    expect(at).toEqual({
      bound: [1, 0, null],
      runnable: [2, 0, "false"],
      order: [3, 0, null],
      missing: [3, 1, "error"],
    });
    expect(layout.lanes).toBe(2);
  });

  it("places a join after its deepest source", () => {
    const { at } = place(
      ["branch", "yes", "more", "no", "join"],
      [
        edge("t", "branch"),
        edge("branch", "yes", "true"),
        edge("yes", "more"),
        edge("branch", "no", "false"),
        edge("more", "join"),
        edge("no", "join"),
      ],
    );
    expect(at.join).toEqual([4, 0, null]);
    expect(at.no).toEqual([2, 1, "false"]);
  });

  it("keeps a join on the main line and routes the skip under the steps", () => {
    const { layout, at } = place(
      ["check", "approve", "record", "alert"],
      [
        edge("t", "check"),
        edge("check", "approve", "true"),
        edge("check", "record", "false"),
        edge("approve", "record"),
        edge("record", "alert", "error"),
      ],
    );
    expect(at).toEqual({
      check: [1, 0, null],
      approve: [2, 0, "true"],
      record: [3, 0, null],
      alert: [4, 0, "error"],
    });
    const under = layout.edges.filter((e) => e.track.under);
    expect(under.map((e) => `${e.from}>${e.to}`)).toEqual(["check>record"]);
  });

  it("runs a lane change along whichever lane has no steps in the way", () => {
    const { layout, at } = place(
      ["a", "b", "c", "d"],
      [
        edge("t", "a"),
        edge("a", "b", "false"),
        edge("b", "c"),
        edge("a", "d", "error"),
        edge("c", "d"),
      ],
    );
    expect(at).toEqual({
      a: [1, 0, null],
      b: [2, 1, "false"],
      c: [3, 1, null],
      d: [4, 1, null],
    });
    const skip = layout.edges.find((e) => e.from === "a" && e.to === "d");
    expect(skip?.track).toEqual({ lane: 0, under: false });
    const drop = layout.edges.find((e) => e.from === "a" && e.to === "b");
    expect(drop?.track).toEqual({ lane: 1, under: false });
  });

  it("fans out steps on the same port into free lanes", () => {
    const { at } = place(["a", "b"], [edge("t", "a"), edge("t", "b")]);
    expect(at).toEqual({ a: [1, 0, null], b: [1, 1, null] });
  });

  it("leaves out steps a run never reaches", () => {
    const { layout } = place(["a", "lost"], [edge("t", "a")]);
    expect(layout.nodes.map((n) => n.step.id)).toEqual(["a"]);
  });

  it("starts entry steps in the first column without a trigger", () => {
    const { at } = place(["a", "b"], [edge("a", "b")], "");
    expect(at).toEqual({ a: [1, 0, null], b: [2, 0, null] });
  });
});
