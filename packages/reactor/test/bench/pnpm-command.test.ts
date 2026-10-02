import { afterEach, describe, expect, it, vi } from "vitest";
import { pnpmCommand } from "../../bench/pnpm-command.js";

describe("pnpmCommand", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("spawns a native pnpm entry point directly", () => {
    expect(pnpmCommand("C:\\pnpm\\pnpm.exe", "C:\\node\\node.exe")).toEqual([
      "C:\\pnpm\\pnpm.exe",
      [],
    ]);
    expect(pnpmCommand("/usr/local/bin/pnpm", "/usr/bin/node")).toEqual([
      "/usr/local/bin/pnpm",
      [],
    ]);
  });

  // corepack ships pnpm as a .cjs, which is not executable on its own.
  it("puts node in front of a JS entry point", () => {
    expect(pnpmCommand("/c/pnpm/pnpm.cjs", "/usr/bin/node")).toEqual([
      "/usr/bin/node",
      ["/c/pnpm/pnpm.cjs"],
    ]);
    for (const entry of ["pnpm.js", "pnpm.mjs", "pnpm.CJS"]) {
      expect(pnpmCommand(`/c/pnpm/${entry}`, "/usr/bin/node")).toEqual([
        "/usr/bin/node",
        [`/c/pnpm/${entry}`],
      ]);
    }
  });

  // Passing `undefined` would take the default and read the real env, so the
  // unset case has to come through the environment itself.
  it("falls back to the bare name when pnpm did not export one", () => {
    expect(pnpmCommand("", "/usr/bin/node")).toEqual(["pnpm", []]);
    vi.stubEnv("npm_execpath", "");
    expect(pnpmCommand()).toEqual(["pnpm", []]);
  });

  it("reads npm_execpath and the running node by default", () => {
    const [file, lead] = pnpmCommand();
    expect(typeof file).toBe("string");
    expect(file).not.toBe("");
    // Either form: a direct entry takes no leading args, a JS one takes one.
    expect(lead.length).toBeLessThanOrEqual(1);
  });
});
