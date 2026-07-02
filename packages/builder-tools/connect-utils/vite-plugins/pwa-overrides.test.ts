import { describe, expect, it } from "vitest";
import {
  applyPwaOverrides,
  type ConnectPwaManifest,
  type ConnectWorkboxOptions,
} from "./pwa-overrides.js";

describe("applyPwaOverrides", () => {
  const baseManifest: ConnectPwaManifest = {
    name: "Powerhouse Connect",
    theme_color: "#ffffff",
    icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }],
  };
  const baseFn = ({ url }: { url: URL }) => url.origin === "https://x";
  const baseWorkbox: ConnectWorkboxOptions = {
    maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
    globPatterns: ["**/*.js"],
    runtimeCaching: [
      {
        urlPattern: baseFn,
        handler: "CacheFirst",
        options: { cacheName: "x" },
      },
    ],
    navigateFallbackDenylist: [/^\/health$/],
  };

  it("returns the base untouched for an empty override", () => {
    const { manifest, workbox } = applyPwaOverrides(
      { manifest: baseManifest, workbox: baseWorkbox },
      {},
    );
    expect(manifest).toEqual(baseManifest);
    expect(workbox.runtimeCaching).toHaveLength(1);
    expect(workbox.globPatterns).toEqual(["**/*.js"]);
  });

  it("overrides manifest scalars and appends icons", () => {
    const { manifest } = applyPwaOverrides(
      { manifest: baseManifest, workbox: baseWorkbox },
      {
        manifest: {
          theme_color: "#000000",
          icons: [{ src: "extra.png", sizes: "512x512" }],
        },
      },
    );
    expect(manifest.theme_color).toBe("#000000");
    expect(manifest.name).toBe("Powerhouse Connect"); // untouched
    expect(manifest.icons).toEqual([
      { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "extra.png", sizes: "512x512" },
    ]);
  });

  it("keeps base function rules first and appends config rules (with regex)", () => {
    const { workbox } = applyPwaOverrides(
      { manifest: baseManifest, workbox: baseWorkbox },
      {
        runtimeCaching: [
          {
            urlPattern: { source: "^https://api\\.acme\\.io/", flags: "i" },
            handler: "NetworkFirst",
            options: { cacheName: "acme", networkTimeoutSeconds: 3 },
          },
        ],
      },
    );
    expect(workbox.runtimeCaching).toHaveLength(2);
    // Base function rule preserved and stays first (Workbox first-match-wins).
    expect(typeof workbox.runtimeCaching?.[0].urlPattern).toBe("function");
    const appended = workbox.runtimeCaching?.[1];
    expect(appended?.handler).toBe("NetworkFirst");
    // Options pass through verbatim, networkTimeoutSeconds included.
    expect(appended?.options).toEqual({
      cacheName: "acme",
      networkTimeoutSeconds: 3,
    });
    // Reconstructed from { source, flags } into a working RegExp. Assert
    // behaviour rather than `.source` (the spec escapes `/` → `\/` there).
    const re = appended?.urlPattern as RegExp;
    expect(re).toBeInstanceOf(RegExp);
    expect(re.flags).toContain("i");
    expect(re.test("https://API.ACME.IO/thing")).toBe(true);
    expect(re.test("https://other.example/thing")).toBe(false);
  });

  it("raises the size ceiling via max and unions globs", () => {
    const { workbox } = applyPwaOverrides(
      { manifest: baseManifest, workbox: baseWorkbox },
      {
        maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
        globPatterns: ["**/*.js", "**/*.wasm"],
      },
    );
    expect(workbox.maximumFileSizeToCacheInBytes).toBe(32 * 1024 * 1024);
    expect(workbox.globPatterns).toEqual(["**/*.js", "**/*.wasm"]);
  });

  it("does not lower the size ceiling below the base", () => {
    const { workbox } = applyPwaOverrides(
      { manifest: baseManifest, workbox: baseWorkbox },
      { maximumFileSizeToCacheInBytes: 1024 },
    );
    expect(workbox.maximumFileSizeToCacheInBytes).toBe(16 * 1024 * 1024);
  });

  it("appends denylist patterns after the base entries, always as RegExps", () => {
    const { workbox } = applyPwaOverrides(
      { manifest: baseManifest, workbox: baseWorkbox },
      { navigateFallbackDenylist: ["/custom", { source: "^/z" }] },
    );
    const denylist = workbox.navigateFallbackDenylist;
    expect(denylist).toHaveLength(3);
    // Workbox only accepts RegExps here, so every entry must be one.
    for (const entry of denylist ?? []) expect(entry).toBeInstanceOf(RegExp);
    expect(denylist?.[0]).toEqual(/^\/health$/);
    expect(denylist?.[2]?.test("/z/route")).toBe(true);
  });

  it("escapes string denylist patterns so they match literally", () => {
    const { workbox } = applyPwaOverrides(
      { manifest: baseManifest, workbox: baseWorkbox },
      { navigateFallbackDenylist: ["/api?x=1"] },
    );
    const re = workbox.navigateFallbackDenylist?.[1];
    expect(re?.test("/api?x=1")).toBe(true);
    // An unescaped `?` would make the `i` optional and match this too.
    expect(re?.test("/apx=1")).toBe(false);
  });
});
