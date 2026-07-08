import type { PHConnectPwa } from "@powerhousedao/shared/connect";
import { describe, expect, it } from "vitest";
import { resolveFragmentAssetUrls } from "./pwa-idb.js";

describe("resolveFragmentAssetUrls", () => {
  const base = "https://cdn.example.com/-/cdn/@scope/pkg@1.0.0/";

  it("resolves relative manifest icon srcs against the package base", () => {
    const config: PHConnectPwa = {
      manifest: { icons: [{ src: "icon.png", sizes: "192x192" }] },
    };
    const out = resolveFragmentAssetUrls(config, base);
    expect(out.manifest?.icons?.[0].src).toBe(`${base}icon.png`);
  });

  it("leaves absolute srcs untouched", () => {
    const config: PHConnectPwa = {
      manifest: { icons: [{ src: "https://other.com/i.png" }] },
    };
    const out = resolveFragmentAssetUrls(config, base);
    expect(out.manifest?.icons?.[0].src).toBe("https://other.com/i.png");
  });

  it("resolves file-handler icons, shortcut icons and screenshots too", () => {
    const config: PHConnectPwa = {
      manifest: {
        file_handlers: [
          { accept: { "app/x": [".x"] }, icons: [{ src: "fh.png" }] },
        ],
        shortcuts: [{ name: "S", url: "./s", icons: [{ src: "sc.png" }] }],
        screenshots: [{ src: "shot.png" }],
      },
    };
    const out = resolveFragmentAssetUrls(config, base);
    expect(out.manifest?.file_handlers?.[0].icons?.[0].src).toBe(
      `${base}fh.png`,
    );
    expect(out.manifest?.shortcuts?.[0].icons?.[0].src).toBe(`${base}sc.png`);
    expect(out.manifest?.screenshots?.[0].src).toBe(`${base}shot.png`);
  });

  it("leaves srcs untouched for a local/bundled package (null base)", () => {
    const config: PHConnectPwa = {
      manifest: { icons: [{ src: "icon.png" }] },
    };
    const out = resolveFragmentAssetUrls(config, null);
    expect(out.manifest?.icons?.[0].src).toBe("icon.png");
  });

  it("passes a fragment with no manifest through untouched", () => {
    const config: PHConnectPwa = { globPatterns: ["**/*.js"] };
    expect(resolveFragmentAssetUrls(config, base)).toEqual(config);
  });
});
