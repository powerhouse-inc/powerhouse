import { describe, expect, it } from "vitest";
import {
  parseView,
  resolveTarget,
  sharedPanel,
} from "../src/shell/location.js";
import { TEST_REGISTRY } from "./registry.fixture.js";

const resolve = (panel: string, tab?: string) =>
  resolveTarget(
    { panel, ...(tab && { tab }), focus: { kind: "job", id: "42" } },
    TEST_REGISTRY,
  );

describe("DevTools location", () => {
  it("keeps a known panel, tab and focus", () => {
    expect(resolve("beta", "first")).toEqual({
      panel: "beta",
      tab: "first",
      focus: { kind: "job", id: "42" },
    });
  });

  it("falls back to the default panel, without the focus, for an unknown one", () => {
    expect(resolve("gone", "first")).toEqual({ panel: "alpha", tab: "alpha" });
  });

  it("falls back to the panel's default tab for an unknown or missing one", () => {
    expect(resolve("beta", "gone").tab).toBe("second");
    expect(resolve("beta").tab).toBe("second");
  });
});

describe("a saved view", () => {
  it("reads back what DevTools saves", () => {
    const view = {
      open: true,
      target: {
        panel: "beta",
        tab: "first",
        focus: { kind: "operation", id: "invoice-0042:global:5" },
      },
    };
    expect(parseView(JSON.parse(JSON.stringify(view)))).toEqual(view);
    expect(parseView({ open: false })).toEqual({ open: false });
  });

  it("is not one without an open flag", () => {
    for (const json of [null, "beta", [], {}, { open: "yes" }]) {
      expect(parseView(json)).toBeUndefined();
    }
  });

  it("drops a target with no panel, and a tab or focus that is not one", () => {
    expect(parseView({ open: true, target: { tab: "first" } })).toEqual({
      open: true,
    });
    expect(
      parseView({
        open: true,
        target: { panel: "beta", tab: 3, focus: { kind: "job", id: "" } },
      }),
    ).toEqual({ open: true, target: { panel: "beta" } });
  });
});

describe("a share link", () => {
  it("names the panel of its ph-devtools param", () => {
    expect(sharedPanel("?theme=dark&ph-devtools=models")).toBe("models");
  });

  it("is a bare param with no panel, and the last one when it repeats", () => {
    expect(sharedPanel("?ph-devtools")).toBe("");
    expect(sharedPanel("?ph-devtools=a&ph-devtools=b")).toBe("b");
  });

  it("is not one without the param, the router devtools' devtools=1 included", () => {
    expect(sharedPanel("")).toBeUndefined();
    expect(sharedPanel("?devtools=1")).toBeUndefined();
  });
});
