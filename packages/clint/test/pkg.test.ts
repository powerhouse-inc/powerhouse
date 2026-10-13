import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { readPackageInfo } from "../src/core/pkg.js";

// Read the real package.json for comparison
const realPkg = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
);

describe("readPackageInfo", () => {
  // readPackageInfo resolves root as: dirname(file) → parent.
  // For a file in src/, parent = project root. Use src/index.ts as fixture.
  const fixtureUrl = new URL("../src/index.ts", import.meta.url).href;

  it("reads name and version from the library package.json", () => {
    const info = readPackageInfo(fixtureUrl);
    expect(info.name).toBe("clint");
    expect(info.version).toBe(realPkg.version);
    expect(info.root).toMatch(/packages[/\\]clint$/);
  });

  it("strips @scope/ prefix from scoped package names", () => {
    const info = readPackageInfo(fixtureUrl);
    expect(realPkg.name).toBe("@powerhousedao/clint");
    expect(info.name).toBe("clint");
  });

  it("throws when package.json has no name", () => {
    const dir = join(tmpdir(), `pkg-test-${randomBytes(4).toString("hex")}`);
    const srcDir = join(dir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ version: "1.0.0" }),
    );

    const fakeUrl = `file://${srcDir}/fake.ts`;
    expect(() => readPackageInfo(fakeUrl)).toThrow('No "name"');
  });

  it("throws when package.json has no version", () => {
    const dir = join(tmpdir(), `pkg-test-${randomBytes(4).toString("hex")}`);
    const srcDir = join(dir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "test-pkg" }),
    );

    const fakeUrl = `file://${srcDir}/fake.ts`;
    expect(() => readPackageInfo(fakeUrl)).toThrow('No "version"');
  });
});
