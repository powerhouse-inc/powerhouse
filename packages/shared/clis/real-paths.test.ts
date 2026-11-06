import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pathWithin, realPathThroughExistingParent } from "./real-paths.js";

let root: string;
beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), "ph-real-paths-")));
  mkdirSync(join(root, "real"));
  symlinkSync(join(root, "real"), join(root, "alias"), "dir");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("realPathThroughExistingParent", () => {
  it("resolves a symlinked directory", () => {
    expect(realPathThroughExistingParent(join(root, "alias"))).toBe(
      join(root, "real"),
    );
  });

  it("keeps the missing tail under the real parent", () => {
    expect(
      realPathThroughExistingParent(join(root, "alias", "not", "yet.ts")),
    ).toBe(join(root, "real", "not", "yet.ts"));
  });

  it("follows a dangling symlink to where it points", () => {
    symlinkSync(join(root, "alias", "missing"), join(root, "real", "dangling"));
    expect(
      realPathThroughExistingParent(join(root, "alias", "dangling", "a.ts")),
    ).toBe(join(root, "real", "missing", "a.ts"));
  });

  it("follows a relative dangling symlink from its own directory", () => {
    symlinkSync("../outside/x.ts", join(root, "real", "model.ts"));
    expect(realPathThroughExistingParent(join(root, "alias", "model.ts"))).toBe(
      join(root, "outside", "x.ts"),
    );
  });

  it("throws on a symlink loop", () => {
    symlinkSync(join(root, "b"), join(root, "a"));
    symlinkSync(join(root, "a"), join(root, "b"));
    expect(() => realPathThroughExistingParent(join(root, "a"))).toThrow(
      /ELOOP/,
    );
  });
});

describe("pathWithin", () => {
  it.each([
    ["/p", "/p", ""],
    ["/p", "/p/src/a.ts", join("src", "a.ts")],
    ["/p", "/p/..a", "..a"],
    ["/p", "/p2/a.ts", null],
    ["/p", "/", null],
    ["/p/src", "/p", null],
  ])("%s holds %s: %s", (rootDir, path, expected) => {
    expect(pathWithin(rootDir, path)).toBe(expected);
  });
});
