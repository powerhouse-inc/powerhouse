import { describe, expect, it } from "vitest";
import { hostRulesContextSchema, isDelete, setterSchema } from "./schema.js";

describe("setterSchema", () => {
  it.each([
    ["the delete marker", { $delete: true }],
    ["a value", { featureFlags: { authGroups: true } }],
    ["null", null],
  ])("accepts %s", (_name, value) => {
    expect(
      setterSchema.safeParse({ path: "host.runner.port", value }).success,
    ).toBe(true);
  });

  it.each([
    ["a marker with company", { $delete: true, x: 1 }],
    ["a false marker", { $delete: false }],
  ])("refuses %s", (_name, value) => {
    const result = setterSchema.safeParse({ path: "host.runner.port", value });
    expect(result.success).toBe(false);
  });

  it("tells the marker from a value", () => {
    expect(isDelete({ $delete: true })).toBe(true);
    expect(isDelete({ $delete: true, x: 1 } as never)).toBe(false);
    expect(isDelete(null)).toBe(false);
    expect(isDelete([])).toBe(false);
  });
});

describe("hostRulesContextSchema", () => {
  it("defaults signer credentials to a Renown service", () => {
    expect(
      hostRulesContextSchema.parse({ postgres: false, controller: true }),
    ).toEqual({
      postgres: false,
      controller: true,
      renownSource: "remote",
    });
  });
});
