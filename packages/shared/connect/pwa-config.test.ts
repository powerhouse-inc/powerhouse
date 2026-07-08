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

  it("concatenates file_handlers in precedence order and drops exact duplicates", () => {
    const handler = { accept: { "application/x-a+zip": [".aaa"] } };
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", { manifest: { file_handlers: [handler] } }),
        pkg("@b/pkg", {
          manifest: {
            file_handlers: [
              handler, // exact duplicate → dropped
              { accept: { "application/x-b+zip": [".bbb"] } },
            ],
          },
        }),
      ],
      undefined,
    );
    expect(merged.manifest?.file_handlers).toEqual([
      { accept: { "application/x-a+zip": [".aaa"] } },
      { accept: { "application/x-b+zip": [".bbb"] } },
    ]);
  });

  it("treats file_handlers differing only in accept key order as duplicates", () => {
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", {
          manifest: {
            file_handlers: [{ accept: { "app/x": [".x"], "app/y": [".y"] } }],
          },
        }),
        pkg("@b/pkg", {
          manifest: {
            file_handlers: [{ accept: { "app/y": [".y"], "app/x": [".x"] } }],
          },
        }),
      ],
      undefined,
    );
    expect(merged.manifest?.file_handlers).toHaveLength(1);
  });

  it("keeps two handlers accepting different types — both are real contributions", () => {
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", {
          manifest: { file_handlers: [{ accept: { "app/x": [".x"] } }] },
        }),
        pkg("@b/pkg", {
          manifest: { file_handlers: [{ accept: { "app/x": [".x2"] } }] },
        }),
      ],
      undefined,
    );
    expect(merged.manifest?.file_handlers).toHaveLength(2);
  });

  it("never reports file_handlers from two packages as a scalar conflict", () => {
    const onWarn = vi.fn();
    mergePwaConfig(
      [
        pkg("@a/pkg", {
          manifest: { file_handlers: [{ accept: { "app/x": [".x"] } }] },
        }),
        pkg("@b/pkg", {
          manifest: { file_handlers: [{ accept: { "app/y": [".y"] } }] },
        }),
      ],
      undefined,
      onWarn,
    );
    expect(onWarn).not.toHaveBeenCalled();
  });

  it("does not warn when two packages agree on launch_handler (compared by value)", () => {
    const onWarn = vi.fn();
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", {
          manifest: { launch_handler: { client_mode: "focus-existing" } },
        }),
        pkg("@b/pkg", {
          manifest: { launch_handler: { client_mode: "focus-existing" } },
        }),
      ],
      undefined,
      onWarn,
    );
    expect(merged.manifest?.launch_handler).toEqual({
      client_mode: "focus-existing",
    });
    expect(onWarn).not.toHaveBeenCalled();
  });

  it("warns on conflicting launch_handler values and lets the project settle it", () => {
    const onWarn = vi.fn();
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", {
          manifest: { launch_handler: { client_mode: "focus-existing" } },
        }),
        pkg("@b/pkg", {
          manifest: { launch_handler: { client_mode: "navigate-new" } },
        }),
      ],
      undefined,
      onWarn,
    );
    expect(merged.manifest?.launch_handler).toEqual({
      client_mode: "navigate-new", // last-declared wins
    });
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onWarn.mock.calls[0][0]).toMatch(/launch_handler/);

    const settled = vi.fn();
    const withProject = mergePwaConfig(
      [
        pkg("@a/pkg", {
          manifest: { launch_handler: { client_mode: "focus-existing" } },
        }),
        pkg("@b/pkg", {
          manifest: { launch_handler: { client_mode: "navigate-new" } },
        }),
      ],
      { manifest: { launch_handler: { client_mode: "auto" } } },
      settled,
    );
    expect(withProject.manifest?.launch_handler).toEqual({
      client_mode: "auto",
    });
    expect(settled).not.toHaveBeenCalled();
  });

  it("concatenates and dedupes shortcuts by url", () => {
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", {
          manifest: { shortcuts: [{ name: "A", url: "/a" }] },
        }),
        pkg("@b/pkg", {
          manifest: {
            shortcuts: [
              { name: "A dup", url: "/a" }, // dup url → dropped
              { name: "B", url: "/b" },
            ],
          },
        }),
      ],
      undefined,
    );
    expect(merged.manifest?.shortcuts).toEqual([
      { name: "A", url: "/a" },
      { name: "B", url: "/b" },
    ]);
  });

  it("concatenates and dedupes protocol_handlers by protocol", () => {
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", {
          manifest: { protocol_handlers: [{ protocol: "web+ph" }] },
        }),
        pkg("@b/pkg", {
          manifest: {
            protocol_handlers: [
              { protocol: "web+ph" }, // dup → dropped
              { protocol: "web+phd" },
            ],
          },
        }),
      ],
      undefined,
    );
    expect(merged.manifest?.protocol_handlers).toEqual([
      { protocol: "web+ph" },
      { protocol: "web+phd" },
    ]);
  });

  it("concatenates and dedupes screenshots by src", () => {
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", {
          manifest: { screenshots: [{ src: "s1.png" }] },
        }),
        pkg("@b/pkg", {
          manifest: {
            screenshots: [{ src: "s1.png" }, { src: "s2.png" }],
          },
        }),
      ],
      undefined,
    );
    expect(merged.manifest?.screenshots).toEqual([
      { src: "s1.png" },
      { src: "s2.png" },
    ]);
  });

  it("unions categories and display_override (order-preserving)", () => {
    const merged = mergePwaConfig(
      [
        pkg("@a/pkg", {
          manifest: {
            categories: ["productivity", "finance"],
            display_override: ["window-controls-overlay", "standalone"],
          },
        }),
        pkg("@b/pkg", {
          manifest: {
            categories: ["finance", "utilities"],
            display_override: ["standalone", "browser"],
          },
        }),
      ],
      undefined,
    );
    expect(merged.manifest?.categories).toEqual([
      "productivity",
      "finance",
      "utilities",
    ]);
    expect(merged.manifest?.display_override).toEqual([
      "window-controls-overlay",
      "standalone",
      "browser",
    ]);
  });

  it("replaces share_target wholesale (last-declared wins), not deep-merged", () => {
    const onWarn = vi.fn();
    const merged = mergePwaConfig(
      [
        // Disjoint fields: if share_target were deep-merged, title/text would
        // survive into the winner. Wholesale replacement drops them.
        pkg("@a/pkg", {
          manifest: {
            share_target: { params: { title: "a", text: "atext" } },
          },
        }),
        pkg("@b/pkg", {
          manifest: { share_target: { params: { url: "burl" } } },
        }),
      ],
      undefined,
      onWarn,
    );
    expect(merged.manifest?.share_target).toEqual({
      params: { url: "burl" },
    });
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onWarn.mock.calls[0][0]).toMatch(/share_target/);
  });

  it("does not report additive manifest arrays as scalar conflicts", () => {
    const onWarn = vi.fn();
    mergePwaConfig(
      [
        pkg("@a/pkg", {
          manifest: {
            shortcuts: [{ name: "A", url: "/a" }],
            protocol_handlers: [{ protocol: "web+ph" }],
            categories: ["x"],
          },
        }),
        pkg("@b/pkg", {
          manifest: {
            shortcuts: [{ name: "B", url: "/b" }],
            protocol_handlers: [{ protocol: "web+phd" }],
            categories: ["y"],
          },
        }),
      ],
      undefined,
      onWarn,
    );
    expect(onWarn).not.toHaveBeenCalled();
  });
});
