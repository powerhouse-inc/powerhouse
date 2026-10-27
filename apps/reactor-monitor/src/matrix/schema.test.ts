import { describe, expect, it } from "vitest";
import { definition } from "./__fixtures__/matrix.js";
import {
  attachMode,
  CHECK_NAMES,
  isDelete,
  MATRIX_LIMITS,
  MATRIX_TIMEOUTS_MS,
  matrixDefinitionSchema,
  runTimeoutMs,
  type MatrixDefinitionInput,
} from "./schema.js";

const BASE: MatrixDefinitionInput = {
  format: "ph-monitor-matrix",
  version: 1,
  name: "m",
  base: { project: "/project", host: "switchboard" },
  axes: [{ key: "a", values: [{ key: "x" }] }],
};

function issues(fields: Record<string, unknown>): string[] {
  const result = matrixDefinitionSchema.safeParse({ ...BASE, ...fields });
  return result.success
    ? []
    : result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      );
}

function values(count: number) {
  return Array.from({ length: count }, (_, index) => ({ key: `v${index}` }));
}

describe("matrix definition schema", () => {
  it("fills the defaults", () => {
    expect(definition()).toMatchObject({
      attach: "remote",
      credentialVerification: "skipped",
      negativeTests: false,
      rules: [],
      repetitions: 1,
      concurrency: { remote: 2, browser: 1 },
      checks: CHECK_NAMES,
      settleMs: MATRIX_LIMITS.settleMs.default,
      diskBudgetMb: MATRIX_LIMITS.diskBudgetMb.default,
    });
    expect(definition().axes[0].values[0]).toEqual({
      key: "x",
      setters: [],
      env: {},
      requires: [],
      expect: {},
    });
  });

  it("keeps credentialVerification enforced", () => {
    expect(definition({ credentialVerification: "enforced" })).toMatchObject({
      credentialVerification: "enforced",
    });
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["unknown field", { extra: 1 }, "Unrecognized key"],
    ["bad format", { format: "other" }, "format"],
    ["bad version", { version: 2 }, "version"],
    ["no axes", { axes: [] }, "axes"],
    [
      "too many axes",
      {
        axes: Array.from({ length: 7 }, (_, i) => ({
          key: `a${i}`,
          values: values(1),
        })),
      },
      "axes",
    ],
    [
      "too many values",
      { axes: [{ key: "a", values: values(17) }] },
      "axes.0.values",
    ],
    ["no values", { axes: [{ key: "a", values: [] }] }, "axes.0.values"],
    [
      "too many cells",
      {
        axes: Array.from({ length: 3 }, (_, i) => ({
          key: `a${i}`,
          values: values(11),
        })),
      },
      "1331 cells; at most 1024",
    ],
    [
      "duplicate axis",
      {
        axes: [
          { key: "a", values: values(1) },
          { key: "a", values: values(1) },
        ],
      },
      'axis "a" appears twice',
    ],
    [
      "duplicate value",
      { axes: [{ key: "a", values: [{ key: "x" }, { key: "x" }] }] },
      'value "x" appears twice',
    ],
    ["bad slug", { axes: [{ key: "A=1", values: values(1) }] }, "axes.0.key"],
    [
      "slug with comma",
      { axes: [{ key: "a", values: [{ key: "x,y" }] }] },
      "key",
    ],
    ["repetitions 0", { repetitions: 0 }, "repetitions"],
    ["repetitions 6", { repetitions: 6 }, "repetitions"],
    [
      "remote concurrency 5",
      { concurrency: { remote: 5, browser: 1 } },
      "concurrency.remote",
    ],
    [
      "browser concurrency 3",
      { concurrency: { remote: 1, browser: 3 } },
      "concurrency.browser",
    ],
    ["settle below 5s", { settleMs: 4_999 }, "settleMs"],
    ["settle above 300s", { settleMs: 300_001 }, "settleMs"],
    ["disk above 5 GiB", { diskBudgetMb: 5_121 }, "diskBudgetMb"],
    ["no checks", { checks: [] }, "checks"],
    ["unknown check", { checks: ["nope"] }, "checks.0"],
    [
      "duplicate check",
      { checks: ["processors", "processors"] },
      'check "processors" appears twice',
    ],
    [
      "bad credential mode",
      { credentialVerification: "off" },
      "credentialVerification",
    ],
    ["bad attach", { attach: "router" }, "attach"],
    [
      "too many setters",
      {
        axes: [
          {
            key: "a",
            values: [
              {
                key: "x",
                setters: Array.from({ length: 33 }, () => ({
                  path: "host.runner.port",
                  value: 1,
                })),
              },
            ],
          },
        ],
      },
      "setters",
    ],
    [
      "bad env key",
      {
        axes: [
          { key: "a", values: [{ key: "x", env: { "lower-case": "1" } }] },
        ],
      },
      "env",
    ],
    [
      "bad requirement",
      { axes: [{ key: "a", values: [{ key: "x", requires: ["redis"] }] }] },
      "requires",
    ],
    [
      "rule on unknown axis",
      { rules: [{ kind: "exclude", when: { b: "x" } }] },
      'no axis "b"',
    ],
    [
      "rule on unknown value",
      { rules: [{ kind: "require", if: { a: "x" }, then: { a: ["x", "y"] } }] },
      'axis "a" has no value "y"',
    ],
    [
      "empty match",
      { rules: [{ kind: "exclude", when: {} }] },
      "at least one axis",
    ],
    [
      "unknown rule kind",
      { rules: [{ kind: "prefer", when: { a: "x" } }] },
      "rules.0",
    ],
  ])("refuses %s", (_name, fields, message) => {
    expect(issues(fields).join("\n")).toContain(message);
  });

  it("accepts the limits themselves", () => {
    expect(
      issues({
        axes: [
          { key: "a", values: values(16) },
          { key: "b", values: values(16) },
          { key: "c", values: values(4) },
        ],
        repetitions: 5,
        concurrency: { remote: 4, browser: 2 },
        settleMs: 300_000,
        diskBudgetMb: 5_120,
      }),
    ).toEqual([]);
  });

  it("tells a delete marker from a value", () => {
    expect(isDelete({ $delete: true })).toBe(true);
    expect(isDelete({ $delete: false } as never)).toBe(false);
    expect(isDelete({ $delete: true, x: 1 } as never)).toBe(false);
    expect(isDelete(null)).toBe(false);
    expect(isDelete([])).toBe(false);
  });

  it("maps attach kinds onto modes", () => {
    expect(attachMode("remote")).toBe("controller");
    expect(attachMode("in-process")).toBe("browser");
    expect(attachMode("worker")).toBe("browser");
  });

  it("caps a run at one instance timeout per pool slot", () => {
    expect(
      runTimeoutMs({ remote: 4, browser: 0 }, { remote: 4, browser: 1 }),
    ).toBe(MATRIX_TIMEOUTS_MS.instance);
    expect(
      runTimeoutMs({ remote: 5, browser: 3 }, { remote: 2, browser: 2 }),
    ).toBe(5 * MATRIX_TIMEOUTS_MS.instance);
  });
});
