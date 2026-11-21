import { describe, expect, it } from "vitest";
import {
  checkRetiredFlags,
  findRetiredFlags,
  RETIRED_FLAGS_WARNED_ENV,
  retiredFlags,
  type RetiredFlag,
} from "./retired-flags.js";

const UNIFORM_RUNNERS = "FEATURE_UNIFORM_RUNNERS_ENABLED";
const PLUGIN_HOST = "FEATURE_PLUGIN_HOST_ENABLED";

function collect(
  env: Record<string, string | undefined>,
  flags?: readonly RetiredFlag[],
): string[] {
  const warnings: string[] = [];
  checkRetiredFlags(env, flags, (text) => warnings.push(text));
  return warnings;
}

describe("retired flags: FEATURE_UNIFORM_RUNNERS_ENABLED in 6.4", () => {
  it("is in the table as a refusal, retired in 6.3", () => {
    expect(retiredFlags.find((f) => f.name === UNIFORM_RUNNERS)).toMatchObject({
      retiredIn: "6.3",
      refusedIn: "6.4",
      when: "false",
      action: "refuse",
    });
  });

  it.each(["false", "0", "off", "no", "FALSE", "Off", " no "])(
    "refuses to start for %j",
    (value) => {
      let message = "";
      try {
        collect({ [UNIFORM_RUNNERS]: value });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(
        `${UNIFORM_RUNNERS}=${value} has no effect since 6.3.`,
      );
      expect(message).toContain("Hosts and `ph run` are always on now.");
      expect(message).toContain(
        "since 6.4 the CLI refuses to start with it set to false.",
      );
    },
  );

  it.each(["1", "true", "TRUE", "on", "yes", ""])(
    "passes silently for %j",
    (value) => {
      expect(collect({ [UNIFORM_RUNNERS]: value })).toEqual([]);
    },
  );

  it("passes silently when the variable is unset", () => {
    expect(collect({})).toEqual([]);
  });

  it("refuses even when an earlier process already warned", () => {
    expect(() =>
      collect({ [UNIFORM_RUNNERS]: "false", [RETIRED_FLAGS_WARNED_ENV]: "1" }),
    ).toThrow(/FEATURE_UNIFORM_RUNNERS_ENABLED=false/);
  });
});

describe("retired flags: FEATURE_PLUGIN_HOST_ENABLED in 6.4", () => {
  it("is in the table as a refusal", () => {
    expect(retiredFlags.find((f) => f.name === PLUGIN_HOST)).toMatchObject({
      retiredIn: "6.4",
      refusedIn: "6.4",
      when: "false",
      action: "refuse",
    });
  });

  it.each(["false", "0", "off", "no", "FALSE", " no "])(
    "refuses to start for %j",
    (value) => {
      let message = "";
      try {
        collect({ [PLUGIN_HOST]: value });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(
        `${PLUGIN_HOST}=${value} has no effect since 6.4.`,
      );
      expect(message).toContain(
        "Switchboard always boots through the plugin host now",
      );
      expect(message).toContain("`runner.plugins`");
      expect(message).toContain("hosts/switchboard/host.js");
      expect(message).toContain(
        "since 6.4 the CLI refuses to start with it set to false.",
      );
    },
  );

  it.each(["1", "true", "TRUE", "on", "yes", ""])(
    "passes silently for %j",
    (value) => {
      expect(collect({ [PLUGIN_HOST]: value })).toEqual([]);
    },
  );

  it("refuses even when an earlier process already warned", () => {
    expect(() =>
      collect({ [PLUGIN_HOST]: "false", [RETIRED_FLAGS_WARNED_ENV]: "1" }),
    ).toThrow(/FEATURE_PLUGIN_HOST_ENABLED=false/);
  });
});

describe("retired flags: the table", () => {
  const flag: RetiredFlag = {
    name: "FEATURE_GONE",
    retiredIn: "1.0",
    refusedIn: "2.0",
    when: "false",
    action: "warn",
    message: "The feature is always on now.",
  };

  it("refuses to start once an entry is flipped to refuse", () => {
    const refuse = { ...flag, action: "refuse" } as const;
    expect(() => collect({ FEATURE_GONE: "false" }, [refuse])).toThrow(
      /FEATURE_GONE=false has no effect since 1\.0\. The feature is always on now\. Remove the variable: since 2\.0 the CLI refuses to start with it set to false\./,
    );
    expect(collect({ FEATURE_GONE: "true" }, [refuse])).toEqual([]);
    expect(collect({}, [refuse])).toEqual([]);
  });

  it("refuses even when an earlier process already warned", () => {
    const refuse = { ...flag, action: "refuse" } as const;
    expect(() =>
      collect({ FEATURE_GONE: "0", [RETIRED_FLAGS_WARNED_ENV]: "1" }, [refuse]),
    ).toThrow(/FEATURE_GONE=0/);
  });

  it("an entry with when: set triggers on any non-empty value", () => {
    const any = { ...flag, when: "set" } as const;
    expect(findRetiredFlags({ FEATURE_GONE: "true" }, [any])).toHaveLength(1);
    expect(findRetiredFlags({ FEATURE_GONE: "false" }, [any])).toHaveLength(1);
    expect(findRetiredFlags({ FEATURE_GONE: "" }, [any])).toEqual([]);
    expect(collect({ FEATURE_GONE: "1" }, [any])[0]).toContain(
      "2.0 will refuse to start with it set.",
    );
  });

  it("reports every entry that is hit", () => {
    const other = { ...flag, name: "FEATURE_ALSO_GONE" };
    const env = { FEATURE_GONE: "no", FEATURE_ALSO_GONE: "off" };
    expect(collect(env, [flag, other])).toHaveLength(2);
  });

  it("warns once per invocation: a child that inherits the env is silent", () => {
    const env: Record<string, string | undefined> = { FEATURE_GONE: "false" };
    expect(collect(env, [flag])).toHaveLength(1);
    expect(env[RETIRED_FLAGS_WARNED_ENV]).toBe("1");
    expect(collect({ ...env }, [flag])).toEqual([]);
  });

  it("writes the warning to stderr by default", () => {
    const calls: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => calls.push(args);
    try {
      checkRetiredFlags({ FEATURE_GONE: "false" }, [flag]);
    } finally {
      console.warn = original;
    }
    expect(calls).toHaveLength(1);
  });
});
