import { describe, expect, it, vi } from "vitest";
import type { PHConnectPwa } from "../clis/types.js";
import { mergePwaConfig, type PwaContribution } from "./pwa-config.js";

const pkg = (source: string, config: PHConnectPwa): PwaContribution => ({
  source,
  config,
});

describe("mergePwaConfig", () => {
  it("returns an empty fragment when there are no contributions", () => {
    expect(mergePwaConfig([], undefined)).toEqual({});
  });

  it("lets the project config win a manifest scalar over a package", () => {
    const merged = mergePwaConfig(
      [pkg("@a/pkg", { manifest: { theme_color: "#aaa", name: "Pkg" } })],
      { manifest: { theme_color: "#fff" } },
    );
    expect(merged.manifest?.theme_color).toBe("#fff");
    // A field the project didn't set still comes from the package.
    expect(merged.manifest?.name).toBe("Pkg");
  });

  it("resolves two packages' conflicting scalar by load order and warns", () => {
    const onWarn = vi.fn();
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", { manifest: { theme_color: "#aaa" } }),
        pkg("@b/pkg", { manifest: { theme_color: "#bbb" } }),
      ],
      undefined,
      onWarn,
    );
    expect(merged.manifest?.theme_color).toBe("#bbb"); // last-declared wins
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onWarn.mock.calls[0][0]).toMatch(/theme_color/);
    expect(onWarn.mock.calls[0][0]).toMatch(/@a\/pkg, @b\/pkg/);
  });

  it("does not warn when two packages agree on the same scalar value", () => {
    const onWarn = vi.fn();
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", { manifest: { theme_color: "#aaa" } }),
        pkg("@b/pkg", { manifest: { theme_color: "#aaa" } }),
      ],
      undefined,
      onWarn,
    );
    expect(merged.manifest?.theme_color).toBe("#aaa");
    expect(onWarn).not.toHaveBeenCalled();
  });

  it("does not warn when the project config settles a package conflict", () => {
    const onWarn = vi.fn();
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", { manifest: { theme_color: "#aaa" } }),
        pkg("@b/pkg", { manifest: { theme_color: "#bbb" } }),
      ],
      { manifest: { theme_color: "#fff" } },
      onWarn,
    );
    expect(merged.manifest?.theme_color).toBe("#fff");
    expect(onWarn).not.toHaveBeenCalled();
  });

  it("takes the max size ceiling across contributors", () => {
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", { maximumFileSizeToCacheInBytes: 1000 }),
        pkg("@b/pkg", { maximumFileSizeToCacheInBytes: 5000 }),
      ],
      { maximumFileSizeToCacheInBytes: 3000 },
    );
    expect(merged.maximumFileSizeToCacheInBytes).toBe(5000);
  });

  it("concatenates runtimeCaching in precedence order (packages then project)", () => {
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", {
          runtimeCaching: [{ urlPattern: "a", handler: "CacheFirst" }],
        }),
      ],
      { runtimeCaching: [{ urlPattern: "p", handler: "NetworkFirst" }] },
    );
    expect(merged.runtimeCaching?.map((r) => r.urlPattern)).toEqual(["a", "p"]);
  });

  it("unions globs and dedupes repeats", () => {
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", { globPatterns: ["**/*.foo", "**/*.bar"] }),
        pkg("@b/pkg", { globPatterns: ["**/*.bar", "**/*.baz"] }),
      ],
      undefined,
    );
    expect(merged.globPatterns).toEqual(["**/*.foo", "**/*.bar", "**/*.baz"]);
  });

  it("concatenates and dedupes icons by (src,sizes,purpose)", () => {
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", {
          manifest: { icons: [{ src: "a.png", sizes: "48x48" }] },
        }),
        pkg("@b/pkg", {
          manifest: {
            icons: [
              { src: "a.png", sizes: "48x48" }, // dup → dropped
              { src: "b.png", sizes: "96x96" },
            ],
          },
        }),
      ],
      undefined,
    );
    expect(merged.manifest?.icons).toEqual([
      { src: "a.png", sizes: "48x48" },
      { src: "b.png", sizes: "96x96" },
    ]);
  });

  it("unions navigateFallbackDenylist patterns", () => {
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", {
          navigateFallbackDenylist: ["/api", { source: "^/x" }],
        }),
      ],
      { navigateFallbackDenylist: ["/api", { source: "^/y", flags: "i" }] },
    );
    expect(merged.navigateFallbackDenylist).toEqual([
      "/api",
      { source: "^/x" },
      { source: "^/y", flags: "i" },
    ]);
  });
});
