import { describe, expect, it } from "vitest";
import { resolveReactorWorkerEnabled } from "../../src/utils/reactor-worker-flag.js";

describe("resolveReactorWorkerEnabled", () => {
  it("falls back to the config flag with no override", () => {
    expect(resolveReactorWorkerEnabled({ configFlag: false })).toBe(false);
    expect(resolveReactorWorkerEnabled({ configFlag: true })).toBe(true);
  });

  it("lets a query param override the config flag", () => {
    expect(
      resolveReactorWorkerEnabled({ configFlag: false, queryParam: "true" }),
    ).toBe(true);
    expect(
      resolveReactorWorkerEnabled({ configFlag: false, queryParam: "1" }),
    ).toBe(true);
    expect(
      resolveReactorWorkerEnabled({ configFlag: true, queryParam: "false" }),
    ).toBe(false);
  });

  it("lets a stored value override the config flag when no query param", () => {
    expect(
      resolveReactorWorkerEnabled({ configFlag: false, storedValue: "true" }),
    ).toBe(true);
    expect(
      resolveReactorWorkerEnabled({ configFlag: true, storedValue: "false" }),
    ).toBe(false);
  });

  it("prefers the query param over the stored value", () => {
    expect(
      resolveReactorWorkerEnabled({
        configFlag: false,
        queryParam: "true",
        storedValue: "false",
      }),
    ).toBe(true);
  });
});
