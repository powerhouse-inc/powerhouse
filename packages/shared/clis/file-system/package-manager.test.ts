import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectPackageManager } from "./package-manager.js";

const dirs: string[] = [];

/** A temp dir holding fake binaries, for use as a PATH entry. */
function binDir(files: Record<string, { mode?: number }>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-pm-detect-"));
  dirs.push(dir);
  for (const [name, { mode = 0o755 }] of Object.entries(files)) {
    const file = path.join(dir, name);
    writeFileSync(file, "#!/bin/sh\n");
    chmodSync(file, mode);
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
});

describe("detectPackageManager", () => {
  it("uses the package manager named in npm_config_user_agent", () => {
    expect(
      detectPackageManager({
        env: {
          npm_config_user_agent: "pnpm/9.15.0 npm/? node/v22.12.0 linux x64",
          PATH: "",
        },
      }),
    ).toEqual({ pm: "pnpm", source: "user-agent" });
  });

  it("prefers the user agent over binaries found on PATH", () => {
    expect(
      detectPackageManager({
        env: {
          npm_config_user_agent: "bun/1.2.0 npm/? node/v22.6.0 linux x64",
          PATH: binDir({ pnpm: {} }),
        },
      }),
    ).toEqual({ pm: "bun", source: "user-agent" });
  });

  it("ignores a user agent naming an unsupported package manager", () => {
    expect(
      detectPackageManager({
        env: {
          npm_config_user_agent: "deno/2.1.0 npm/? deno/2.1.0 linux x86_64",
          PATH: binDir({ bun: {} }),
        },
      }),
    ).toEqual({ pm: "bun", source: "path" });
  });

  it("finds pnpm on PATH when no user agent is set", () => {
    const empty = binDir({});
    const withPnpm = binDir({ pnpm: {} });
    expect(
      detectPackageManager({
        env: { PATH: [empty, withPnpm].join(path.delimiter) },
        platform: "linux",
      }),
    ).toEqual({ pm: "pnpm", source: "path" });
  });

  it("prefers bun over pnpm when both are on PATH", () => {
    expect(
      detectPackageManager({
        env: { PATH: [binDir({ pnpm: {} }), binDir({ bun: {} })].join(":") },
        platform: "linux",
      }),
    ).toEqual({ pm: "bun", source: "path" });
  });

  it("picks pnpm over bun when bun is not allowed (--clone)", () => {
    expect(
      detectPackageManager({
        env: { PATH: [binDir({ bun: {} }), binDir({ pnpm: {} })].join(":") },
        platform: "linux",
        allowed: ["pnpm", "npm"],
      }),
    ).toEqual({ pm: "pnpm", source: "path" });
  });

  it("skips a non-executable file on POSIX", () => {
    expect(
      detectPackageManager({
        env: { PATH: binDir({ pnpm: { mode: 0o644 } }) },
        platform: "linux",
      }),
    ).toEqual({ pm: "npm", source: "fallback" });
  });

  it("matches PATHEXT extensions on Windows", () => {
    const dir = binDir({ "pnpm.CMD": { mode: 0o644 } });
    expect(
      detectPackageManager({
        env: { Path: `C:\\nope;${dir}`, PATHEXT: ".COM;.EXE;.CMD" },
        platform: "win32",
      }),
    ).toEqual({ pm: "pnpm", source: "path" });
  });

  it("falls back to npm when nothing is detected", () => {
    expect(
      detectPackageManager({ env: { PATH: binDir({}) }, platform: "linux" }),
    ).toEqual({ pm: "npm", source: "fallback" });
  });

  it("only returns an allowed package manager", () => {
    expect(
      detectPackageManager({
        env: {
          npm_config_user_agent: "bun/1.2.0 npm/? node/v22.6.0 linux x64",
          PATH: binDir({ bun: {} }),
        },
        platform: "linux",
        allowed: ["pnpm", "npm"],
      }),
    ).toEqual({ pm: "npm", source: "fallback" });
  });
});
