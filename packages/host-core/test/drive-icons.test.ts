import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDriveDeclaration } from "../src/drives.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function project(files: Record<string, number>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-drive-icons-"));
  dirs.push(dir);
  for (const [rel, bytes] of Object.entries(files)) {
    const file = path.join(dir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.alloc(bytes, 7));
  }
  return dir;
}

describe("drive declaration icons", () => {
  it("resolves a project path to a data URI and refuses an oversize master", () => {
    const dir = project({ "icons/s_64x64.png": 64, "icons/s.png": 70_000 });
    const small = resolveDriveDeclaration(dir, {
      slug: "powerhouse",
      icon: "./icons/s_64x64.png",
    });
    expect(small.icon).toMatch(/^data:image\/png;base64,/);
    // the icon lives in synced drive state, so a large file is skipped
    const big = resolveDriveDeclaration(dir, {
      slug: "powerhouse",
      icon: "./icons/s.png",
    });
    expect(big.icon).toBeUndefined();
    // URLs pass through; no icon stays no icon
    expect(
      resolveDriveDeclaration(dir, {
        slug: "powerhouse",
        icon: "https://x/y.png",
      }).icon,
    ).toBe("https://x/y.png");
    expect(resolveDriveDeclaration(dir, { slug: "powerhouse" }).icon).toBe(
      undefined,
    );
  });
});
