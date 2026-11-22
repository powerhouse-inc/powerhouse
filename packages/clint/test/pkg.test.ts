import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, parse } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { readPackageInfo } from "../src/core/pkg.js";

// Read the real package.json for comparison
const realPkg = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
);

/** A fresh directory under the OS temp dir. */
function tempDir(): string {
  const dir = join(tmpdir(), `pkg-test-${randomBytes(4).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write `json` as `<dir>/package.json`, creating `dir`. */
function writePackageJson(dir: string, json: object): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(json));
}

describe("readPackageInfo", () => {
  // readPackageInfo walks up from the calling file's directory to the nearest
  // package.json. For src/index.ts that is the project root.
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

  it("finds the package.json more than one level above the caller", () => {
    const root = tempDir();
    writePackageJson(root, { name: "@acme/deep-cli", version: "1.2.3" });
    const caller = join(root, "cli", "src", "config.ts");

    const info = readPackageInfo(pathToFileURL(caller).href);
    expect(info).toEqual({ root, name: "deep-cli", version: "1.2.3" });
  });

  it("reads a bundle's own package, not the app that installed it", () => {
    const app = tempDir();
    writePackageJson(app, { name: "the-app", version: "0.0.1" });
    const pkg = join(app, "node_modules", "@acme", "bundled-cli");
    writePackageJson(pkg, { name: "@acme/bundled-cli", version: "2.0.0" });
    const bundle = join(pkg, "dist", "node", "cli", "index.mjs");

    const info = readPackageInfo(pathToFileURL(bundle).href);
    expect(info).toEqual({ root: pkg, name: "bundled-cli", version: "2.0.0" });
  });

  it("takes the nearest package.json, even without a name", () => {
    const root = tempDir();
    writePackageJson(root, { name: "outer", version: "1.0.0" });
    const inner = join(root, "dist");
    writePackageJson(inner, { type: "module" });

    const caller = pathToFileURL(join(inner, "index.mjs")).href;
    expect(() => readPackageInfo(caller)).toThrow(
      `No "name" in ${inner}/package.json`,
    );
  });

  it("throws naming the start directory when no package.json is above", () => {
    // A directory that does not exist, right under the filesystem root: the
    // walk reaches the root after it, which holds no package.json.
    const start = join(
      parse(tmpdir()).root,
      `pkg-test-missing-${randomBytes(4).toString("hex")}`,
      "src",
    );
    const caller = pathToFileURL(join(start, "config.ts")).href;

    expect(() => readPackageInfo(caller)).toThrow(
      `No package.json in ${start} or any directory above it`,
    );
  });
});
