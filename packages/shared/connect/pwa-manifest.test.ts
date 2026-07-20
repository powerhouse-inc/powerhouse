import { describe, expect, it } from "vitest";
import {
  mergeManifest,
  PWA_FILE_HANDLER_ACTION,
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

  it("fragment-wins with protectedScalars overrides cosmetic scalars but keeps protected ones (runtime policy)", () => {
    const merged = mergeManifest(
      { name: "Connect", theme_color: "#ffffff", start_url: ".", scope: "." },
      { name: "Acme", theme_color: "#000000", start_url: "/evil", scope: "/x" },
      {
        scalarPolicy: "fragment-wins",
        protectedScalars: ["start_url", "scope"],
      },
    );
    // Cosmetic scalars: fragment wins, exactly like a build-time contribution.
    expect(merged.name).toBe("Acme");
    expect(merged.theme_color).toBe("#000000");
    // Navigation-critical scalars: base wins even under fragment-wins.
    expect(merged.start_url).toBe(".");
    expect(merged.scope).toBe(".");
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

  it("unions categories (derived, order-preserving, deduped)", () => {
    const merged = mergeManifest(
      { categories: ["a"] },
      { categories: ["a", "b"] },
    );
    expect(merged.categories).toEqual(["a", "b"]);
  });

  it("re-asserting the file-handler action on a base that already carries it is idempotent", () => {
    const once = mergeManifest(base, {
      file_handlers: [{ accept: { "app/x": [".x"] } }],
    });
    const twice = mergeManifest(once, undefined);
    expect(twice.file_handlers).toEqual(once.file_handlers);
  });
});
