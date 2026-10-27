import { describe, expect, it } from "vitest";
import { axisValue, definition } from "./__fixtures__/matrix.js";
import { cellId, expand } from "./expand.js";
import { applyRules, matches, ruleSkip } from "./rules.js";
import type { Axis, Rule } from "./schema.js";

function axis(key: string, ...values: string[]): Axis {
  return { key, values: values.map((value) => axisValue(value)) };
}

const AUTH = axis("auth", "l0", "l2");
const WORKERS = axis("workers", "w0", "w2");
const STORAGE = axis("storage", "path", "memory", "postgres");

describe("expand", () => {
  it("varies the first axis slowest, in declared order", () => {
    expect(expand([AUTH, WORKERS]).map((cell) => cell.id)).toEqual([
      "auth=l0,workers=w0",
      "auth=l0,workers=w2",
      "auth=l2,workers=w0",
      "auth=l2,workers=w2",
    ]);
  });

  it("keeps values in axis order", () => {
    const [first] = expand([WORKERS, AUTH]);
    expect(Object.keys(first.values)).toEqual(["workers", "auth"]);
    expect(first).toEqual({
      id: "workers=w0,auth=l0",
      values: { workers: "w0", auth: "l0" },
    });
  });

  it("multiplies the axes", () => {
    const cells = expand([AUTH, WORKERS, STORAGE]);
    expect(cells).toHaveLength(12);
    expect(new Set(cells.map((cell) => cell.id)).size).toBe(12);
    expect(cells[11].id).toBe("auth=l2,workers=w2,storage=postgres");
  });

  it("gives one axis one cell per value and no axes none", () => {
    expect(expand([STORAGE]).map((cell) => cell.id)).toEqual([
      "storage=path",
      "storage=memory",
      "storage=postgres",
    ]);
    expect(expand([])).toEqual([]);
  });

  it("derives the id from the values", () => {
    expect(cellId({ a: "x", b: "y" })).toBe("a=x,b=y");
  });
});

describe("rules", () => {
  const cell = { auth: "l2", workers: "w2", storage: "path" };

  it.each<[Rule["kind"] | "match", Record<string, string | string[]>, boolean]>(
    [
      ["match", { auth: "l2" }, true],
      ["match", { auth: "l0" }, false],
      ["match", { auth: ["l0", "l2"] }, true],
      ["match", { auth: "l2", workers: "w0" }, false],
      ["match", { auth: "l2", workers: ["w0", "w2"] }, true],
    ],
  )("%s %j → %s", (_kind, match, expected) => {
    expect(matches(match, cell)).toBe(expected);
  });

  it("excludes a matching cell", () => {
    expect(ruleSkip([{ kind: "exclude", when: { workers: "w2" } }], cell)).toBe(
      "rule 1: excludes workers=w2",
    );
    expect(
      ruleSkip([{ kind: "exclude", when: { workers: "w0" } }], cell),
    ).toBeUndefined();
  });

  it("drops a cell that meets `if` but not `then`", () => {
    const rule: Rule = {
      kind: "require",
      if: { workers: "w2" },
      then: { storage: "postgres" },
      reason: "workers need postgres",
    };
    expect(ruleSkip([rule], cell)).toBe(
      "rule 1 (workers need postgres): workers=w2 requires storage=postgres",
    );
    expect(ruleSkip([rule], { ...cell, storage: "postgres" })).toBeUndefined();
    expect(ruleSkip([rule], { ...cell, workers: "w0" })).toBeUndefined();
  });

  it("names the first rule that drops the cell", () => {
    const rules: Rule[] = [
      { kind: "exclude", when: { auth: "l0" } },
      { kind: "exclude", when: { storage: ["memory", "path"] } },
      { kind: "exclude", when: { workers: "w2" } },
    ];
    expect(ruleSkip(rules, cell)).toBe(
      "rule 2: excludes storage∈{memory,path}",
    );
  });

  it("marks only the dropped cells", () => {
    const { axes } = definition({
      axes: [
        { key: "auth", values: [{ key: "l0" }, { key: "l2" }] },
        { key: "workers", values: [{ key: "w0" }, { key: "w2" }] },
      ],
    });
    const result = applyRules(expand(axes), [
      { kind: "require", if: { workers: "w2" }, then: { auth: "l2" } },
    ]);
    expect(result.map((entry) => [entry.id, entry.skip !== undefined])).toEqual(
      [
        ["auth=l0,workers=w0", false],
        ["auth=l0,workers=w2", true],
        ["auth=l2,workers=w0", false],
        ["auth=l2,workers=w2", false],
      ],
    );
    expect(result[0]).not.toHaveProperty("skip");
  });
});
