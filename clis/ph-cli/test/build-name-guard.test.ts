// Focused tests for `assertManifestNameMatchesPackage`, the guard `runBuild`
// runs first so a divergent `powerhouse.manifest.json` name aborts the build
// before any heavy work happens.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertManifestNameMatchesPackage } from "../src/services/build.js";

const created: string[] = [];

/**
 * Create a throwaway project dir with a package.json and (optionally) a
 * powerhouse.manifest.json. Pass `manifestName: undefined` to omit the manifest.
 */
function makeProject(opts: {
  packageName: string;
  manifestName?: string;
}): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-build-guard-"));
  created.push(dir);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: opts.packageName, version: "1.0.0" }, null, 2),
  );
  if (opts.manifestName !== undefined) {
    writeFileSync(
      join(dir, "powerhouse.manifest.json"),
      JSON.stringify({ name: opts.manifestName }, null, 2),
    );
  }
  return dir;
}

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("assertManifestNameMatchesPackage", () => {
  it("throws when the manifest name differs from the package name", async () => {
    const dir = makeProject({
      packageName: "@acme/pkg",
      manifestName: "wrong",
    });
    await expect(assertManifestNameMatchesPackage(dir)).rejects.toThrow(
      /Package name mismatch/,
    );
  });

  it("throws when the manifest name is empty", async () => {
    const dir = makeProject({ packageName: "@acme/pkg", manifestName: "" });
    await expect(assertManifestNameMatchesPackage(dir)).rejects.toThrow(
      /Package name mismatch/,
    );
  });

  it("resolves when the manifest name matches the package name", async () => {
    const dir = makeProject({
      packageName: "@acme/pkg",
      manifestName: "@acme/pkg",
    });
    await expect(
      assertManifestNameMatchesPackage(dir),
    ).resolves.toBeUndefined();
  });

  it("is a no-op when the project has no powerhouse.manifest.json", async () => {
    const dir = makeProject({ packageName: "@acme/pkg" });
    await expect(
      assertManifestNameMatchesPackage(dir),
    ).resolves.toBeUndefined();
  });

  it("throws with a helpful message when the manifest is not valid JSON", async () => {
    const dir = makeProject({ packageName: "@acme/pkg" });
    writeFileSync(join(dir, "powerhouse.manifest.json"), "{ not json");
    await expect(assertManifestNameMatchesPackage(dir)).rejects.toThrow(
      /Failed to parse "powerhouse\.manifest\.json"/,
    );
  });
});
