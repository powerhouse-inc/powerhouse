// A medium on which no file can be made the user's alone (exFAT, Windows
// without its tools): `icacls` fails, and so does chmod.
import type * as ChildProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOwnerOnlyFile,
  NotOwnerOnlyError,
  writeOwnerOnlyFile,
} from "./owner-only.js";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof ChildProcess>()),
  execFileSync: () => {
    throw new Error("no icacls here");
  },
}));

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-owner-only-unrestricted-"));
  vi.spyOn(fs, "chmodSync").mockImplementation(() => {
    throw new Error("EPERM: no modes on this medium");
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("owner-only files where restricting fails", () => {
  it("writes nothing of a secret that must stay the user's, and leaves no draft", () => {
    const file = path.join(dir, "billing.env");
    expect(() =>
      createOwnerOnlyFile(file, "PH_IDENTITY_KEY=0x01", {
        onlyIfRestricted: true,
      }),
    ).toThrow(NotOwnerOnlyError);
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(() =>
      writeOwnerOnlyFile(file, "secret", { onlyIfRestricted: true }),
    ).toThrow(/Could not limit .*billing\.env to your user/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("without the option writes it, and says it is not restricted", () => {
    const file = path.join(dir, "key.json");
    expect(createOwnerOnlyFile(file, "text")).toEqual({
      created: true,
      restricted: false,
    });
    expect(fs.readFileSync(file, "utf8")).toBe("text");
    expect(writeOwnerOnlyFile(file, "again")).toBe(false);
    expect(fs.readFileSync(file, "utf8")).toBe("again");
    expect(fs.readdirSync(dir)).toEqual(["key.json"]);
  });

  it("refuses to write through a link planted where its draft goes", () => {
    const file = path.join(dir, "secret.json");
    const target = path.join(dir, "elsewhere.txt");
    fs.writeFileSync(target, "untouched");
    const draft = `${file}.${process.pid}.tmp`;
    // A draft that reappears between its removal and its creation.
    const rm = fs.rmSync.bind(fs);
    vi.spyOn(fs, "rmSync").mockImplementation((p, o) => {
      rm(p, o);
      if (String(p) === draft) fs.linkSync(target, draft);
    });
    expect(() => writeOwnerOnlyFile(file, "secret")).toThrow(/EEXIST/);
    expect(fs.readFileSync(target, "utf8")).toBe("untouched");
    expect(fs.existsSync(file)).toBe(false);
  });
});
