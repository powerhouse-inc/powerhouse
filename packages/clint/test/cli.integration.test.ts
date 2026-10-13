import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, "fixtures", "test-cli.ts");
// NOTE(port): the .bin shim is a .CMD on Windows (spawn ENOENT) — resolve
// tsx's real JS entry and run it with the current node instead.
import { createRequire } from "node:module";
const TSX_ENTRY = createRequire(import.meta.url).resolve("tsx/cli");

async function run(
  ...args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return exec(process.execPath, [TSX_ENTRY, CLI_PATH, ...args]);
}

async function runExpectFail(
  ...args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    await exec(process.execPath, [TSX_ENTRY, CLI_PATH, ...args]);
    throw new Error("Expected command to fail");
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      code: err.code ?? 1,
    };
  }
}

describe("cli.run() integration", () => {
  describe("successful commands", () => {
    it("executes a command and prints the result", async () => {
      const { stdout } = await run("greet", "--name", "Alice");
      expect(stdout.trim()).toBe("Hello, Alice!");
    });

    it("handles boolean flags", async () => {
      const { stdout } = await run("greet", "--name", "Alice", "--loud");
      expect(stdout.trim()).toBe("HELLO, ALICE!");
    });

    it("prints nothing when command returns undefined", async () => {
      const { stdout } = await run("noop");
      expect(stdout.trim()).toBe("");
    });
  });

  describe("help and version", () => {
    it("shows top-level help with --help", async () => {
      const { stdout } = await run("--help");
      expect(stdout).toContain("test-fixture");
      expect(stdout).toContain("greet");
      expect(stdout).toContain("Greet someone");
    });

    it("shows command help with greet --help", async () => {
      const { stdout } = await run("greet", "--help");
      expect(stdout).toContain("--name");
      expect(stdout).toContain("--loud");
    });

    it("shows version with --version", async () => {
      const { stdout } = await run("--version");
      expect(stdout.trim()).toBe("0.0.1");
    });
  });

  describe("error handling", () => {
    it("fails with non-zero exit on missing required arg", async () => {
      const { code, stderr } = await runExpectFail("greet");
      expect(code).not.toBe(0);
      expect(stderr).toContain("name");
    });

    it("fails with non-zero exit on unknown command", async () => {
      const { code } = await runExpectFail("nonexistent");
      expect(code).not.toBe(0);
    });

    it("fails with non-zero exit when command throws", async () => {
      const { code, stderr } = await runExpectFail("fail");
      expect(code).not.toBe(0);
      expect(stderr).toContain("intentional failure");
    });
  });
});
