import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  iconVariantPath,
  resolveConnectIcons,
  resolveImageRef,
} from "../src/icons.js";
import { resolveDriveDeclaration } from "../src/drives.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function project(files: Record<string, number>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-icons-"));
  dirs.push(dir);
  for (const [rel, bytes] of Object.entries(files)) {
    const file = path.join(dir, rel);
    rmSync(file, { force: true });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.alloc(bytes, 7));
  }
  return dir;
}

describe("resolveImageRef", () => {
  it("turns a project path into a data URI and passes URLs through", () => {
    const dir = project({ "icons/a.png": 10 });
    expect(resolveImageRef(dir, "./icons/a.png")).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(resolveImageRef(dir, "https://x/y.png")).toBe("https://x/y.png");
    expect(resolveImageRef(dir, "data:image/png;base64,AA")).toBe(
      "data:image/png;base64,AA",
    );
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

describe("resolveConnectIcons", () => {
  it("finds the favicon variants by naming and uses 64 px as the logo", () => {
    const dir = project({
      "icons/shop.png": 500,
      "icons/shop_16x16.png": 16,
      "icons/shop_64x64.png": 64,
      "icons/file.png": 5,
    });
    expect(iconVariantPath(dir, "./icons/shop.png", 32)).toBeUndefined();
    const icons = resolveConnectIcons(dir, {
      app: "./icons/shop.png",
      document: "./icons/file.png",
      documents: { "acme/order": "./icons/file.png" },
      drives: { powerhouse: "./icons/shop_64x64.png" },
    });
    expect(icons?.appVariants?.map((v) => v.size)).toEqual([16, 64]);
    expect(icons?.app).toBe(icons?.appVariants?.[1]?.src);
    expect(icons?.document).toMatch(/^data:image\/png/);
    expect(icons?.documents?.["acme/order"]).toMatch(/^data:image\/png/);
    // drive icons travel through drive declarations, not the runtime config
    expect(icons).not.toHaveProperty("drives");
  });
});

describe("drive declaration icons", () => {
  it("resolves a project path to a data URI and refuses an oversize master", () => {
    const dir = project({ "icons/s_64x64.png": 64, "icons/s.png": 70_000 });
    const small = resolveDriveDeclaration(dir, {
      slug: "powerhouse",
      icon: "./icons/s_64x64.png",
    });
    expect(small.icon).toMatch(/^data:image\/png;base64,/);
    const big = resolveDriveDeclaration(dir, {
      slug: "powerhouse",
      icon: "./icons/s.png",
    });
    expect(big.icon).toBeUndefined();
  });
});
