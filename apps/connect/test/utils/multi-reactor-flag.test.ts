import { describe, expect, it } from "vitest";
import { resolveMultiReactorEnabled } from "../../src/utils/multi-reactor-flag.js";

describe("resolveMultiReactorEnabled", () => {
  it("falls back to the config flag with no override", () => {
    expect(resolveMultiReactorEnabled({ configFlag: false })).toBe(false);
    expect(resolveMultiReactorEnabled({ configFlag: true })).toBe(true);
  });

  it("lets a query param override the config flag", () => {
    expect(
      resolveMultiReactorEnabled({ configFlag: false, queryParam: "true" }),
    ).toBe(true);
    expect(
      resolveMultiReactorEnabled({ configFlag: false, queryParam: "1" }),
    ).toBe(true);
    expect(
      resolveMultiReactorEnabled({ configFlag: true, queryParam: "false" }),
    ).toBe(false);
  });

  it("lets a stored value override the config flag when no query param", () => {
    expect(
      resolveMultiReactorEnabled({ configFlag: false, storedValue: "true" }),
    ).toBe(true);
    expect(
      resolveMultiReactorEnabled({ configFlag: true, storedValue: "false" }),
    ).toBe(false);
  });

  it("prefers the query param over the stored value", () => {
    expect(
      resolveMultiReactorEnabled({
        configFlag: false,
        queryParam: "true",
        storedValue: "false",
      }),
    ).toBe(true);
  });

  it("ignores an unrecognized query param instead of disabling", () => {
    expect(
      resolveMultiReactorEnabled({ configFlag: true, queryParam: "on" }),
    ).toBe(true);
    expect(
      resolveMultiReactorEnabled({
        configFlag: false,
        queryParam: "yes",
        storedValue: "true",
      }),
    ).toBe(true);
  });

  it("treats 0 as an explicit disable", () => {
    expect(
      resolveMultiReactorEnabled({ configFlag: true, queryParam: "0" }),
    ).toBe(false);
  });
});
