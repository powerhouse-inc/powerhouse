// The compile cache's directory check, on real directories.
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateDirectory, writable } from "./transport.js";

const posix = typeof process.getuid === "function";

describe.skipIf(!posix)("privateDirectory", () => {
  let root = "";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ph-private-dir-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("accepts a directory only its owner can reach", () => {
    chmodSync(root, 0o700);
    expect(privateDirectory(root)).toBe(true);
  });

  it("refuses one others can write to", () => {
    chmodSync(root, 0o777);
    expect(privateDirectory(root)).toBe(false);
  });

  it("refuses a file or a link where the directory should be", () => {
    const file = join(root, "file");
    writeFileSync(file, "");
    const link = join(root, "link");
    symlinkSync(root, link);

    expect(privateDirectory(file)).toBe(false);
    expect(privateDirectory(link)).toBe(false);
  });
});

describe.skipIf(!posix || process.getuid?.() === 0)("writable", () => {
  it("tells a file we may rewrite from one we may not", () => {
    const root = mkdtempSync(join(tmpdir(), "ph-writable-"));
    try {
      const file = join(root, "entry.js");
      writeFileSync(file, "");
      expect(writable(file)).toBe(true);
      chmodSync(file, 0o444);
      expect(writable(file)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
