import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isRuntimeFlagEnabled,
  resolveRuntimeFlag,
} from "../../src/utils/runtime-flag.js";

describe("resolveRuntimeFlag", () => {
  it("prefers a query override, then a stored override, then the config flag", () => {
    expect(resolveRuntimeFlag({ configFlag: false, queryParam: "true" })).toBe(
      true,
    );
    expect(
      resolveRuntimeFlag({
        configFlag: true,
        queryParam: "false",
        storedValue: "true",
      }),
    ).toBe(false);
    expect(resolveRuntimeFlag({ configFlag: true, storedValue: "false" })).toBe(
      false,
    );
    expect(resolveRuntimeFlag({ configFlag: true })).toBe(true);
  });
});

describe("isRuntimeFlagEnabled degrades when localStorage throws", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubWindow(
    search: string,
    opts: { getThrows?: boolean; setThrows?: boolean } = {},
  ): void {
    vi.stubGlobal("window", {
      location: { search },
      localStorage: {
        getItem: () => {
          if (opts.getThrows) {
            throw new Error("storage blocked");
          }
          return null;
        },
        setItem: () => {
          if (opts.setThrows) {
            throw new Error("storage blocked");
          }
        },
      },
    });
  }

  it("falls back to the config flag when getItem throws (private mode)", () => {
    stubWindow("", { getThrows: true });
    expect(
      isRuntimeFlagEnabled({
        queryKey: "multiReactor",
        storageKey: "ph:multiReactor",
        readConfigFlag: () => true,
      }),
    ).toBe(true);
    expect(
      isRuntimeFlagEnabled({
        queryKey: "multiReactor",
        storageKey: "ph:multiReactor",
        readConfigFlag: () => false,
      }),
    ).toBe(false);
  });

  it("still applies a query-param override when persisting it throws", () => {
    stubWindow("?multiReactor=true", { setThrows: true });
    expect(
      isRuntimeFlagEnabled({
        queryKey: "multiReactor",
        storageKey: "ph:multiReactor",
        readConfigFlag: () => false,
      }),
    ).toBe(true);
  });
});
