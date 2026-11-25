import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOwnerOnlyFile,
  fileAccessList,
  restrictFileToOwner,
  writeOwnerOnlyFile,
} from "./owner-only.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-owner-only-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function expectOwnerOnly(file: string) {
  if (process.platform === "win32") {
    expect(fileAccessList(file)).toHaveLength(1);
  } else {
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  }
}

describe("owner-only files", () => {
  it("writes and replaces a file only its user may read", () => {
    const file = path.join(dir, "secret.json");
    expect(writeOwnerOnlyFile(file, "one")).toBe(true);
    expect(writeOwnerOnlyFile(file, "two")).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe("two");
    expectOwnerOnly(file);
    expect(fs.readdirSync(dir)).toEqual(["secret.json"]);
  });

  it.runIf(process.platform === "win32")(
    "removes explicit entries a new file was given, as on an elevated runner",
    () => {
      const file = path.join(dir, "key.json");
      fs.writeFileSync(file, "secret");
      const icacls = path.join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "icacls.exe",
      );
      // SYSTEM and Administrators, as a runner's default access list adds them.
      execFileSync(icacls, [file, "/grant", "*S-1-5-18:F", "*S-1-5-32-544:F"]);
      expect(fileAccessList(file).length).toBeGreaterThan(1);
      expect(restrictFileToOwner(file)).toBe(true);
      expectOwnerOnly(file);
    },
  );

  it("creates a file once: a second writer keeps the first one's text", () => {
    const file = path.join(dir, "key.json");
    expect(createOwnerOnlyFile(file, "first")).toEqual({
      created: true,
      restricted: true,
    });
    expect(createOwnerOnlyFile(file, "second").created).toBe(false);
    expect(fs.readFileSync(file, "utf8")).toBe("first");
    expectOwnerOnly(file);
    expect(fs.readdirSync(dir)).toEqual(["key.json"]);
  });
});
