import { describe, expect, it } from "vitest";
import { fitGraph, GEOMETRY, simplify } from "./WorkflowGraph.js";

const sm = GEOMETRY.sm;
// Where a full row of `n` columns ends, names included.
const rowEnd = (g: typeof sm, n: number) =>
  g.lead + (n - 1) * g.col + g.r + g.col / 2;

describe("fitGraph", () => {
  it("keeps one row beside the trigger when the steps fit there", () => {
    const { g, stacked, perRow } = fitGraph(sm, 4, { width: 900, pill: 220 });
    expect(stacked).toBe(false);
    expect(perRow).toBe(4);
    expect(g.lead).toBe(sm.lead);
  });

  it("widens the columns into spare room, within the row", () => {
    const { g } = fitGraph(sm, 4, { width: 900, pill: 220 });
    expect(g.col).toBeGreaterThan(sm.col);
    expect(g.col).toBeLessThanOrEqual(sm.col * 1.5);
    expect(rowEnd(g, 4)).toBeLessThanOrEqual(900 - 220);
  });

  it("stops widening at half as wide again", () => {
    expect(fitGraph(sm, 2, { width: 1400, pill: 200 }).g.col).toBe(
      sm.col * 1.5,
    );
  });

  it("wraps the steps onto rows under the trigger when they do not fit", () => {
    const { g, stacked, perRow } = fitGraph(sm, 12, {
      width: 850,
      pill: 230,
    });
    expect(stacked).toBe(true);
    expect(g.col).toBeGreaterThanOrEqual(sm.col);
    expect(g.lead).toBe(sm.pillLogoX * 2);
    expect(perRow).toBeLessThan(12);
    expect(rowEnd(g, perRow)).toBeLessThanOrEqual(850);
  });

  it("only moves the trigger when the steps fit once it is out of the way", () => {
    const { stacked, perRow } = fitGraph(sm, 6, { width: 900, pill: 230 });
    expect(stacked).toBe(true);
    expect(perRow).toBe(6);
  });

  it("keeps at least two steps a row, however narrow", () => {
    expect(fitGraph(sm, 12, { width: 120, pill: 230 }).perRow).toBe(2);
  });

  it("leaves the graph alone until it has been measured", () => {
    expect(fitGraph(sm, 12, null)).toEqual({
      g: sm,
      stacked: false,
      perRow: 12,
    });
  });
});

describe("simplify", () => {
  it("keeps the corner of a turn whose next points repeat it", () => {
    // Out to the row's end, down, and straight into a step on the turn.
    expect(
      simplify([
        [100, 10],
        [160, 10],
        [160, 80],
        [160, 80],
        [160, 80],
        [148, 80],
      ]),
    ).toEqual([
      [100, 10],
      [160, 10],
      [160, 80],
      [148, 80],
    ]);
  });

  it("drops straight-through points", () => {
    expect(
      simplify([
        [0, 0],
        [10, 0],
        [20, 0],
        [20, 5],
      ]),
    ).toEqual([
      [0, 0],
      [20, 0],
      [20, 5],
    ]);
  });
});
