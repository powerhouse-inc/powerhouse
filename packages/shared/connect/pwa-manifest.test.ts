import { describe, expect, it } from "vitest";
import {
  mergeManifest,
  PWA_FILE_HANDLER_ACTION,
  PWA_PROTOCOL_HANDLER_URL,
  PWA_SHARE_TARGET_ACTION,
  type PwaWebManifest,
} from "./pwa-manifest.js";

const base: PwaWebManifest = {
  name: "Powerhouse Connect",
  theme_color: "#ffffff",
  icons: [{ src: "pwa-192.png", sizes: "192x192" }],
  file_handlers: [
    {
      action: PWA_FILE_HANDLER_ACTION,
      accept: { "application/vnd.powerhouse.document+zip": [".phd"] },
    },
  ],
};

describe("mergeManifest", () => {
  it("returns the base unchanged for an empty/absent fragment", () => {
    expect(mergeManifest(base, undefined)).toEqual(base);
  });

  it("base-wins (default): a fragment cannot rename or re-theme Connect", () => {
    const merged = mergeManifest(base, {
      name: "Evil Rename",
      theme_color: "#000000",
    });
    expect(merged.name).toBe("Powerhouse Connect");
    expect(merged.theme_color).toBe("#ffffff");
  });

  it("base-wins still fills scalars the base left unset", () => {
    const merged = mergeManifest(
      { name: "Connect" },
      { description: "desc", theme_color: "#abc" },
    );
    expect(merged.description).toBe("desc");
    expect(merged.theme_color).toBe("#abc");
  });

  it("fragment-wins overrides base scalars (build-time policy)", () => {
    const merged = mergeManifest(
      base,
      { theme_color: "#000000" },
      { scalarPolicy: "fragment-wins" },
    );
    expect(merged.theme_color).toBe("#000000");
    expect(merged.name).toBe("Powerhouse Connect"); // untouched
  });

  it("appends + dedupes icons, base first", () => {
    const merged = mergeManifest(base, {
      icons: [
        { src: "pwa-192.png", sizes: "192x192" }, // dup → dropped
        { src: "pkg.png", sizes: "512x512" },
      ],
    });
    expect(merged.icons).toEqual([
      { src: "pwa-192.png", sizes: "192x192" },
      { src: "pkg.png", sizes: "512x512" },
    ]);
  });

  it("appends a contributed file handler with the fixed action, base first", () => {
    const merged = mergeManifest(base, {
      file_handlers: [{ accept: { "application/x-a+zip": [".a"] } }],
    });
    expect(merged.file_handlers).toEqual([
      {
        action: PWA_FILE_HANDLER_ACTION,
        accept: { "application/vnd.powerhouse.document+zip": [".phd"] },
      },
      {
        action: PWA_FILE_HANDLER_ACTION,
        accept: { "application/x-a+zip": [".a"] },
      },
    ]);
  });

  it("injects the Connect-owned url into contributed protocol handlers", () => {
    const merged = mergeManifest(base, {
      protocol_handlers: [{ protocol: "web+ph" }],
    });
    expect(merged.protocol_handlers).toEqual([
      { protocol: "web+ph", url: PWA_PROTOCOL_HANDLER_URL },
    ]);
  });

  it("injects the Connect-owned action + POST/multipart defaults into share_target with files", () => {
    const merged = mergeManifest(base, {
      share_target: { params: { files: [{ name: "f", accept: [".phd"] }] } },
    });
    expect(merged.share_target).toEqual({
      action: PWA_SHARE_TARGET_ACTION,
      method: "POST",
      enctype: "multipart/form-data",
      params: { files: [{ name: "f", accept: [".phd"] }] },
    });
  });

  it("defaults share_target without files to urlencoded", () => {
    const merged = mergeManifest(base, {
      share_target: { params: { title: "t" } },
    });
    expect(merged.share_target?.enctype).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("unions categories and display_override", () => {
    const merged = mergeManifest(
      { categories: ["a"], display_override: ["standalone"] },
      { categories: ["a", "b"], display_override: ["window-controls-overlay"] },
    );
    expect(merged.categories).toEqual(["a", "b"]);
    expect(merged.display_override).toEqual([
      "standalone",
      "window-controls-overlay",
    ]);
  });

  it("re-asserting routes on a base that already carries them is idempotent", () => {
    const once = mergeManifest(base, {
      protocol_handlers: [{ protocol: "web+ph" }],
    });
    const twice = mergeManifest(once, undefined);
    expect(twice.file_handlers).toEqual(once.file_handlers);
    expect(twice.protocol_handlers).toEqual(once.protocol_handlers);
  });
});
