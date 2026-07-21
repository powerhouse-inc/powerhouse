// @vitest-environment happy-dom
//
// Covers the DOM mechanics only (link swapped, single element, pathname
// preserved, rev bumped without accumulating, crossorigin carried over).
// happy-dom has no Web App Manifest processing, so whether Chromium actually
// re-consumes the manifest after the swap is manual browser QA (success signal:
// DevTools → Application → Manifest reflects a newly-installed package's config
// without a full reload).

import { afterEach, describe, expect, it } from "vitest";
import { refreshPwaManifestLink } from "./pwa-manifest-link.js";

describe("refreshPwaManifestLink", () => {
  afterEach(() => {
    document.head.querySelectorAll('link[rel="manifest"]').forEach((l) => {
      l.remove();
    });
  });

  it("is a no-op when there is no manifest link", () => {
    expect(() => refreshPwaManifestLink()).not.toThrow();
    expect(document.querySelector('link[rel="manifest"]')).toBeNull();
  });

  it("replaces the manifest link with a fresh cache-busting href", () => {
    const original = document.createElement("link");
    original.rel = "manifest";
    original.href = "/manifest.webmanifest";
    document.head.appendChild(original);

    refreshPwaManifestLink();

    const links = document.head.querySelectorAll('link[rel="manifest"]');
    // Exactly one link (the old one was replaced, not duplicated).
    expect(links).toHaveLength(1);
    const link = links[0] as HTMLLinkElement;
    expect(link).not.toBe(original); // a new element
    const url = new URL(link.href, "https://x");
    expect(url.pathname).toBe("/manifest.webmanifest"); // pathname preserved
    expect(url.searchParams.get("ph-manifest-rev")).toBeTruthy();
  });

  it("bumps the revision on each call so the href changes", () => {
    const original = document.createElement("link");
    original.rel = "manifest";
    original.href = "/manifest.webmanifest";
    document.head.appendChild(original);

    refreshPwaManifestLink();
    const first = (
      document.querySelector('link[rel="manifest"]') as HTMLLinkElement
    ).href;
    refreshPwaManifestLink();
    const second = (
      document.querySelector('link[rel="manifest"]') as HTMLLinkElement
    ).href;

    expect(second).not.toBe(first);
    // Still a single link, still the same pathname.
    expect(document.querySelectorAll('link[rel="manifest"]')).toHaveLength(1);
    expect(new URL(second, "https://x").pathname).toBe("/manifest.webmanifest");
    // The rev param is replaced, not accumulated (searchParams.set, not append).
    expect(
      new URL(second, "https://x").searchParams.getAll("ph-manifest-rev"),
    ).toHaveLength(1);
  });

  it("preserves the crossorigin attribute", () => {
    const original = document.createElement("link");
    original.rel = "manifest";
    original.href = "/manifest.webmanifest";
    original.crossOrigin = "use-credentials";
    document.head.appendChild(original);

    refreshPwaManifestLink();

    const link = document.querySelector(
      'link[rel="manifest"]',
    ) as HTMLLinkElement;
    expect(link.crossOrigin).toBe("use-credentials");
  });
});
