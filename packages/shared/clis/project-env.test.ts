import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isDotenvDisabled,
  loadProjectEnv,
  readPortEnv,
  resetProjectEnvForTests,
} from "./project-env.js";

describe("loadProjectEnv", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ph-env-"));
    delete process.env.PH_SWITCHBOARD_PORT;
    resetProjectEnvForTests();
  });

  afterEach(() => {
    delete process.env.PH_SWITCHBOARD_PORT;
    delete process.env.PH_NO_DOTENV;
    resetProjectEnvForTests();
  });

  it("reads .env", () => {
    writeFileSync(join(dir, ".env"), "PH_SWITCHBOARD_PORT=41001\n");
    loadProjectEnv(dir);
    expect(process.env.PH_SWITCHBOARD_PORT).toBe("41001");
  });

  it("lets .env.local win over .env", () => {
    writeFileSync(join(dir, ".env"), "PH_SWITCHBOARD_PORT=41001\n");
    writeFileSync(join(dir, ".env.local"), "PH_SWITCHBOARD_PORT=41002\n");
    loadProjectEnv(dir);
    expect(process.env.PH_SWITCHBOARD_PORT).toBe("41002");
  });

  it("lets a real process.env value win over both files", () => {
    process.env.PH_SWITCHBOARD_PORT = "41003";
    writeFileSync(join(dir, ".env"), "PH_SWITCHBOARD_PORT=41001\n");
    writeFileSync(join(dir, ".env.local"), "PH_SWITCHBOARD_PORT=41002\n");
    loadProjectEnv(dir);
    expect(process.env.PH_SWITCHBOARD_PORT).toBe("41003");
  });

  it("reads neither file under PH_NO_DOTENV", () => {
    process.env.PH_NO_DOTENV = "1";
    writeFileSync(join(dir, ".env"), "PH_SWITCHBOARD_PORT=41001\n");
    writeFileSync(join(dir, ".env.local"), "PH_SWITCHBOARD_PORT=41002\n");
    loadProjectEnv(dir);
    expect(process.env.PH_SWITCHBOARD_PORT).toBeUndefined();
  });

  it("is a no-op when neither file exists", () => {
    loadProjectEnv(dir);
    expect(process.env.PH_SWITCHBOARD_PORT).toBeUndefined();
  });
});

describe("isDotenvDisabled", () => {
  it.each([
    ["1", true],
    ["true", true],
    [" TRUE ", true],
    ["0", false],
    ["", false],
    [undefined, false],
  ])("PH_NO_DOTENV=%j is %s", (value, expected) => {
    expect(isDotenvDisabled({ PH_NO_DOTENV: value })).toBe(expected);
  });
});

describe("readPortEnv", () => {
  afterEach(() => {
    delete process.env.PH_TEST_PORT;
  });

  it("parses a valid port", () => {
    process.env.PH_TEST_PORT = "41837";
    expect(readPortEnv("PH_TEST_PORT")).toBe(41837);
  });

  it.each(["", "   ", "abc", "0", "70000", "-1", "41837.5"])(
    "ignores the invalid value %j",
    (raw) => {
      process.env.PH_TEST_PORT = raw;
      expect(readPortEnv("PH_TEST_PORT")).toBeUndefined();
    },
  );

  it("returns undefined when unset", () => {
    expect(readPortEnv("PH_TEST_PORT")).toBeUndefined();
  });
});
