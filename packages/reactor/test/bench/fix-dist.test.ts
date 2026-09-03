import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  distVerdict,
  isRuntimeDistFile,
  isSourceFile,
  newestFile,
  SOURCE_SKIP_DIRS,
} from "../../bench/fix/fix-dist.js";

describe("isSourceFile", () => {
  it("counts code and assets, not tests, declarations or the files a version bump touches", () => {
    expect(isSourceFile("src/index.ts")).toBe(true);
    expect(isSourceFile("document-model/reducer.ts")).toBe(true);
    expect(isSourceFile("tsdown.config.ts")).toBe(true);
    expect(isSourceFile("src/schema.graphql")).toBe(true);
    expect(isSourceFile("src/a.test.ts")).toBe(false);
    expect(isSourceFile("src/a.bench.ts")).toBe(false);
    expect(isSourceFile("src/types.d.ts")).toBe(false);
    expect(isSourceFile("package.json")).toBe(false);
    expect(isSourceFile("tsconfig.build.json")).toBe(false);
    expect(isSourceFile("README.md")).toBe(false);
  });
});

describe("isRuntimeDistFile", () => {
  it("counts only the JavaScript tsc --build cannot refresh", () => {
    expect(isRuntimeDistFile("index.js")).toBe(true);
    expect(isRuntimeDistFile("node/x.mjs")).toBe(true);
    expect(isRuntimeDistFile("index.d.ts")).toBe(false);
    expect(isRuntimeDistFile("index.d.mts")).toBe(false);
    expect(isRuntimeDistFile("index.js.map")).toBe(false);
    expect(isRuntimeDistFile("tsconfig.tsbuildinfo")).toBe(false);
  });
});

describe("distVerdict", () => {
  const older = { mtimeMs: 1_000, file: "a" };
  const newer = { mtimeMs: 2_000, file: "b" };

  it("is stale only when a source file is newer than every runtime dist file", () => {
    expect(distVerdict(true, newer, older)).toBe("stale");
    expect(distVerdict(true, older, newer)).toBe("fresh");
    expect(distVerdict(true, undefined, newer)).toBe("fresh");
    expect(distVerdict(true, newer, undefined)).toBe("no-dist");
    expect(distVerdict(false, newer, undefined)).toBe("no-build");
  });
});

describe("newestFile", () => {
  it("skips the excluded and dot directories and reports the newest match", () => {
    const root = mkdtempSync(join(tmpdir(), "fix-dist-"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "test"));
    mkdirSync(join(root, ".turbo"));
    mkdirSync(join(root, "dist"));
    const at = (path: string, seconds: number) => {
      writeFileSync(path, "x");
      utimesSync(path, seconds, seconds);
    };
    at(join(root, "src", "index.ts"), 1_000);
    at(join(root, "src", "other.ts"), 1_500);
    at(join(root, "test", "index.test.ts"), 9_000);
    at(join(root, ".turbo", "cache.ts"), 9_000);
    at(join(root, "dist", "index.d.ts"), 9_000);
    at(join(root, "dist", "index.js"), 1_200);

    expect(newestFile(root, isSourceFile, SOURCE_SKIP_DIRS)).toEqual({
      mtimeMs: 1_500_000,
      file: "src/other.ts",
    });
    expect(
      newestFile(join(root, "dist"), isRuntimeDistFile, new Set()),
    ).toEqual({ mtimeMs: 1_200_000, file: "index.js" });
  });
});
