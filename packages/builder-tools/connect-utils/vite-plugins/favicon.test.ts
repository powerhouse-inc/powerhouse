import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { describe, expect, it } from "vitest";
import { getConnectBaseViteConfig } from "../vite-config.js";

// branding.favicon (and --favicon) is the tab icon even with branding.icon set:
// the icon's sized siblings must not replace the icon.ico link it is built as.
describe("getConnectBaseViteConfig favicon precedence", () => {
  const html =
    '<html><head><link rel="icon" href="/icon.ico" /><title>x</title></head></html>';
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48,
    0x44, 0x52, 0, 0, 0, 16, 0, 0, 0, 16,
  ]);

  function brandHtml(
    branding: Record<string, unknown>,
    favicon?: string,
  ): string {
    const root = mkdtempSync(join(process.cwd(), "node_modules/.fav-wire-"));
    try {
      mkdirSync(join(root, "icons"));
      for (const file of ["app.png", "app_16x16.png", "app_32x32.png"]) {
        writeFileSync(join(root, "icons", file), pngHeader);
      }
      writeFileSync(join(root, "icons", "tab.ico"), "ico");
      writeFileSync(
        join(root, "powerhouse.config.json"),
        JSON.stringify({ connect: { branding } }),
      );
      const config = getConnectBaseViteConfig({
        mode: "production",
        dirname: root,
        favicon,
      });
      const plugin = (config.plugins as Plugin[]).find(
        (p) => p.name === "ph-connect-project-brand",
      );
      const transform = plugin?.transformIndexHtml as (h: string) => string;
      return transform(html);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it("branding.icon's siblings replace Connect's icon.ico", () => {
    const out = brandHtml({ icon: "./icons/app.png" });
    expect(out).not.toContain("icon.ico");
    expect(out).toContain("favicon-16x16.png");
  }, 20000);

  it("branding.favicon or --favicon keeps the icon.ico link it is built as", () => {
    for (const out of [
      brandHtml({ icon: "./icons/app.png", favicon: "icons/tab.ico" }),
      brandHtml({ icon: "./icons/app.png" }, "icons/tab.ico"),
    ]) {
      expect(out).toContain('href="/icon.ico"');
      expect(out).not.toContain("favicon-16x16.png");
    }
  }, 20000);
});
