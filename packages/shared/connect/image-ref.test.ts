import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  iconVariantPath,
  isPassthroughImageRef,
  resolveImageRef,
} from "./image-ref.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function project(files: Record<string, number>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-image-ref-"));
  dirs.push(dir);
  for (const [rel, bytes] of Object.entries(files)) {
    const file = path.join(dir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.alloc(bytes, 7));
  }
  return dir;
}

describe("resolveImageRef", () => {
  it("turns a project path into a data URI and passes URLs through", () => {
    const dir = project({ "icons/a.png": 10, "icons/b.webp": 3 });
    expect(resolveImageRef(dir, "./icons/a.png")).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(resolveImageRef(dir, "icons/b.webp")).toMatch(
      /^data:image\/webp;base64,/,
    );
    expect(resolveImageRef(dir, "https://x/y.png")).toBe("https://x/y.png");
    expect(resolveImageRef(dir, "data:image/png;base64,AA")).toBe(
      "data:image/png;base64,AA",
    );
    expect(isPassthroughImageRef("//cdn/x.png")).toBe(true);
    expect(isPassthroughImageRef("./x.png")).toBe(false);
  });

  it("null and undefined resolve to nothing", () => {
    const dir = project({});
    expect(resolveImageRef(dir, null)).toBeUndefined();
    expect(resolveImageRef(dir, undefined)).toBeUndefined();
  });

  it("skips missing, unsupported and oversize files with a warning", () => {
    const dir = project({ "big.png": 100, "x.txt": 1 });
    const warnings: string[] = [];
    const warn = (m: string) => warnings.push(m);
    expect(resolveImageRef(dir, "./nope.png", { warn })).toBeUndefined();
    expect(resolveImageRef(dir, "./x.txt", { warn })).toBeUndefined();
    expect(
      resolveImageRef(dir, "./big.png", { maxBytes: 50, warn }),
    ).toBeUndefined();
    expect(warnings).toHaveLength(3);
  });
});

describe("iconVariantPath", () => {
  it("finds the sized sibling by naming convention", () => {
    const dir = project({ "icons/shop.png": 500, "icons/shop_64x64.png": 64 });
    expect(iconVariantPath(dir, "./icons/shop.png", 64)).toBe(
      "./icons/shop_64x64.png",
    );
    expect(iconVariantPath(dir, "./icons/shop.png", 32)).toBeUndefined();
    expect(iconVariantPath(dir, "https://x/shop.png", 64)).toBeUndefined();
  });
});
