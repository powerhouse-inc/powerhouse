import { describe, expect, it } from "vitest";
import {
  applyPwaOverrides,
  FILE_HANDLER_ACTION,
  type ConnectPrecacheOptions,
  type ConnectPwaManifest,
} from "./pwa-overrides.js";

describe("applyPwaOverrides", () => {
  const baseFileHandler = {
    action: FILE_HANDLER_ACTION,
    accept: { "application/vnd.powerhouse.document+zip": [".phd"] },
    icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }],
  };
  const baseManifest: ConnectPwaManifest = {
    name: "Powerhouse Connect",
    theme_color: "#ffffff",
    icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }],
    file_handlers: [baseFileHandler],
    launch_handler: { client_mode: "focus-existing" },
  };
  const basePrecache: ConnectPrecacheOptions = {
    maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
    globPatterns: ["**/*.js"],
    globIgnores: ["**/powerhouse.config.json"],
  };
  const base = { manifest: baseManifest, precache: basePrecache };

  it("returns the base untouched for an empty override", () => {
    const { manifest, precache } = applyPwaOverrides(base, {});
    expect(manifest).toEqual(baseManifest);
    expect(precache).toEqual(basePrecache);
  });

  it("overrides manifest scalars and appends icons", () => {
    const { manifest } = applyPwaOverrides(base, {
      manifest: {
        theme_color: "#000000",
        icons: [{ src: "extra.png", sizes: "512x512" }],
      },
    });
    expect(manifest.theme_color).toBe("#000000");
    expect(manifest.name).toBe("Powerhouse Connect"); // untouched
    expect(manifest.icons).toEqual([
      { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "extra.png", sizes: "512x512" },
    ]);
  });

  it("raises the size ceiling via max and unions globs", () => {
    const { precache } = applyPwaOverrides(base, {
      maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
      globPatterns: ["**/*.js", "**/*.wasm"],
    });
    expect(precache.maximumFileSizeToCacheInBytes).toBe(32 * 1024 * 1024);
    expect(precache.globPatterns).toEqual(["**/*.js", "**/*.wasm"]);
  });

  it("does not lower the size ceiling below the base", () => {
    const { precache } = applyPwaOverrides(base, {
      maximumFileSizeToCacheInBytes: 1024,
    });
    expect(precache.maximumFileSizeToCacheInBytes).toBe(16 * 1024 * 1024);
  });

  it("unions globIgnores with the base", () => {
    const { precache } = applyPwaOverrides(base, {
      globIgnores: ["**/*.map", "**/powerhouse.config.json"],
    });
    expect(precache.globIgnores).toEqual([
      "**/powerhouse.config.json",
      "**/*.map",
    ]);
  });

  it("appends file handlers after the base entry with the fixed action injected", () => {
    const { manifest } = applyPwaOverrides(base, {
      manifest: {
        file_handlers: [
          {
            accept: { "application/x-custom+zip": [".custom"] },
            launch_type: "single-client",
          },
        ],
      },
    });
    expect(manifest.file_handlers).toEqual([
      baseFileHandler, // base stays first → Chromium keeps .phd/.phdm on Connect
      {
        action: FILE_HANDLER_ACTION,
        accept: { "application/x-custom+zip": [".custom"] },
        launch_type: "single-client",
      },
    ]);
    expect(manifest.file_handlers?.[1].launch_type).toBe("single-client");
  });

  it("drops an override handler that duplicates the base entry", () => {
    const { manifest } = applyPwaOverrides(base, {
      manifest: {
        file_handlers: [
          {
            accept: { "application/vnd.powerhouse.document+zip": [".phd"] },
            icons: [
              { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
            ],
          },
        ],
      },
    });
    expect(manifest.file_handlers).toEqual([baseFileHandler]);
  });

  it("lets the override replace launch_handler while leaving other scalars alone", () => {
    const { manifest } = applyPwaOverrides(base, {
      manifest: { launch_handler: { client_mode: "navigate-new" } },
    });
    expect(manifest.launch_handler).toEqual({ client_mode: "navigate-new" });
    expect(manifest.name).toBe("Powerhouse Connect");
    expect(manifest.file_handlers).toEqual([baseFileHandler]);
  });

  it("injects Connect-owned routes into contributed protocol handlers and share target", () => {
    const { manifest } = applyPwaOverrides(base, {
      manifest: {
        protocol_handlers: [{ protocol: "web+ph" }],
        share_target: { params: { files: [{ name: "f", accept: [".phd"] }] } },
        shortcuts: [{ name: "New", url: "./new" }],
      },
    }) as {
      manifest: ConnectPwaManifest & {
        protocol_handlers?: { protocol: string; url?: string }[];
        share_target?: { action?: string; method?: string; enctype?: string };
        shortcuts?: { name: string; url: string }[];
      };
    };
    // Protocol handler gets Connect's fixed url template (contributor sets none).
    expect(manifest.protocol_handlers).toEqual([
      { protocol: "web+ph", url: "./?ph-protocol=%s" },
    ]);
    // Share target gets Connect's action + POST/multipart defaults (files present).
    expect(manifest.share_target?.action).toBe("share-target");
    expect(manifest.share_target?.method).toBe("POST");
    expect(manifest.share_target?.enctype).toBe("multipart/form-data");
    expect(manifest.shortcuts).toEqual([{ name: "New", url: "./new" }]);
  });
});
