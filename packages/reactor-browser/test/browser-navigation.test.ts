import { afterEach, describe, expect, it } from "vitest";
import { browserNavigation } from "../src/hooks/navigation.js";

const START = window.location.pathname;

afterEach(() => {
  window.history.replaceState(null, "", START);
});

describe("the fallback navigation's query params", () => {
  const params = () => Object.fromEntries(new URLSearchParams(location.search));
  const own = "step=a&tab=run&runs.status=FAILED&item=i";
  const target = { driveSlug: "docs", nodeSlug: "spec-2" };

  it("carries only the global params to another target", () => {
    window.history.replaceState(
      null,
      "",
      `/d/docs/spec-1?theme=dark&FEATURE_X=true&${own}`,
    );
    browserNavigation.open(target, { search: { item: "b" } });
    expect(params()).toEqual({ theme: "dark", FEATURE_X: "true", item: "b" });

    browserNavigation.open({ driveSlug: "docs" });
    expect(window.location.pathname).toBe("/d/docs");
    expect(params()).toEqual({ theme: "dark", FEATURE_X: "true" });
  });

  it("links to another target with only the global params", () => {
    window.history.replaceState(null, "", `/d/docs/spec-1?theme=dark&${own}`);
    expect(browserNavigation.hrefFor?.(target)).toBe(
      "/d/docs/spec-2?theme=dark",
    );
  });
});
