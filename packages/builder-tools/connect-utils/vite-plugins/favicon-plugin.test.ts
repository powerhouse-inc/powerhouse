import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectFaviconPlugin } from "./favicon.js";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>`;

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "connect-favicon-"));
  writeFileSync(
    join(root, "index.html"),
    `<html><head><link rel="icon" href="%BASE_URL%icon.ico" /></head><body></body></html>`,
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

async function buildWith(favicon: string) {
  const outDir = join(root, "dist");
  await build({
    root,
    logLevel: "silent",
    build: { outDir, emptyOutDir: true },
    plugins: [connectFaviconPlugin({ faviconPath: join(root, favicon) })],
  });
  return outDir;
}

describe("connectFaviconPlugin", () => {
  it("builds an .svg favicon as icon.svg and links it by its type", async () => {
    writeFileSync(join(root, "brand.svg"), SVG);
    const outDir = await buildWith("brand.svg");
    expect(readFileSync(join(outDir, "icon.svg"), "utf8")).toBe(SVG);
    expect(existsSync(join(outDir, "icon.ico"))).toBe(false);
    expect(readFileSync(join(outDir, "index.html"), "utf8")).toContain(
      `<link rel="icon" type="image/svg+xml" href="/icon.svg" />`,
    );
  });

  it("builds an .ico favicon as icon.ico, link unchanged", async () => {
    writeFileSync(join(root, "brand.ico"), "ico");
    const outDir = await buildWith("brand.ico");
    expect(readFileSync(join(outDir, "icon.ico"), "utf8")).toBe("ico");
    expect(readFileSync(join(outDir, "index.html"), "utf8")).toContain(
      `<link rel="icon" href="/icon.ico"`,
    );
  });
});
