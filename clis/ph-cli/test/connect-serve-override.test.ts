import { describe, expect, it } from "vitest";
import { patchCspScriptSrc } from "../src/services/connect-preview.js";

const html = (csp: string) =>
  `<html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head></html>`;

describe("patchCspScriptSrc (desktop serve, ported from the ph-win sidecar)", () => {
  it("appends the registry to script-src through the HTML escaping", () => {
    const baked = html(
      "default-src &#39;self&#39;; script-src &#39;self&#39; https://apps.powerhouse.io; img-src *",
    );
    const patched = patchCspScriptSrc(baked, "https://registry.vetra.io");
    expect(patched).toContain(
      "script-src &#39;self&#39; https://apps.powerhouse.io https://registry.vetra.io",
    );
    // other directives untouched
    expect(patched).toContain("default-src &#39;self&#39;;");
    expect(patched).toContain("img-src *");
  });

  it("is idempotent when the registry is already allowed", () => {
    const baked = html(
      "script-src &#39;self&#39; https://registry.vetra.io; img-src *",
    );
    expect(patchCspScriptSrc(baked, "https://registry.vetra.io")).toBe(baked);
  });

  it("leaves pages without a CSP meta alone", () => {
    const bare = "<html><head></head></html>";
    expect(patchCspScriptSrc(bare, "https://registry.vetra.io")).toBe(bare);
  });
});
