import { parse } from "cmd-ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isUniformRunnersEnabled,
  UNIFORM_RUNNERS_FLAG,
} from "../src/utils/feature-flags.js";

describe("isUniformRunnersEnabled", () => {
  it("is off when the variable is unset", () => {
    expect(isUniformRunnersEnabled({})).toBe(false);
  });

  it.each(["1", "true", "TRUE", " true "])("is on for %j", (value) => {
    expect(isUniformRunnersEnabled({ [UNIFORM_RUNNERS_FLAG]: value })).toBe(
      true,
    );
  });

  it.each(["0", "false", "", "yes", "on", "enabled"])(
    "stays off for %j (strict values only)",
    (value) => {
      expect(isUniformRunnersEnabled({ [UNIFORM_RUNNERS_FLAG]: value })).toBe(
        false,
      );
    },
  );
});

describe("help listing", () => {
  const saved = process.env[UNIFORM_RUNNERS_FLAG];
  afterEach(() => {
    if (saved === undefined) delete process.env[UNIFORM_RUNNERS_FLAG];
    else process.env[UNIFORM_RUNNERS_FLAG] = saved;
    vi.resetModules();
  });

  it.each([
    ["", false],
    ["1", true],
  ])("with the flag %j lists run and host: %s", async (value, listed) => {
    process.env[UNIFORM_RUNNERS_FLAG] = value;
    vi.resetModules();
    const { phCliHelpCommands } =
      await import("@powerhousedao/shared/clis/args");
    const names = Object.keys(phCliHelpCommands);
    expect(names.includes("run")).toBe(listed);
    expect(names.includes("host")).toBe(listed);
    expect(names).toContain("generate");
  });
});

describe("ph host", () => {
  it.each(["check", "export"])("registers %s", async (name) => {
    const { host } = await import("../src/commands/host.js");
    expect(await parse(host, [name, "switchboard"])).toMatchObject({
      _tag: "ok",
      value: { command: name, args: { host: "switchboard" } },
    });
  });
});
