import { describe, expect, it } from "vitest";
import {
  checkRetiredFlags,
  findRetiredFlags,
  RETIRED_FLAGS_WARNED_ENV,
  retiredFlags,
  type RetiredFlag,
} from "./retired-flags.js";

const UNIFORM_RUNNERS = "FEATURE_UNIFORM_RUNNERS_ENABLED";

function collect(
  env: Record<string, string | undefined>,
  flags?: readonly RetiredFlag[],
): string[] {
  const warnings: string[] = [];
  checkRetiredFlags(env, flags, (text) => warnings.push(text));
  return warnings;
}

describe("retired flags: FEATURE_UNIFORM_RUNNERS_ENABLED in 6.3", () => {
  it("is in the table as a warning, refused from 6.4", () => {
    expect(retiredFlags.find((f) => f.name === UNIFORM_RUNNERS)).toMatchObject({
      retiredIn: "6.3",
      refusedIn: "6.4",
      when: "false",
      action: "warn",
    });
  });

  it.each(["false", "0", "off", "no", "FALSE", "Off", " no "])(
    "warns once for %j",
    (value) => {
      const warnings = collect({ [UNIFORM_RUNNERS]: value });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(UNIFORM_RUNNERS);
      expect(warnings[0]).toContain("Hosts and `ph run` are always on now.");
      expect(warnings[0]).toContain("has no effect");
      expect(warnings[0]).toContain(
        "6.4 will refuse to start with it set to false",
      );
    },
  );

  it.each(["1", "true", "TRUE", "on", "yes", ""])(
    "stays silent for %j",
    (value) => {
      expect(collect({ [UNIFORM_RUNNERS]: value })).toEqual([]);
    },
  );

  it("stays silent when the variable is unset", () => {
    expect(collect({})).toEqual([]);
  });

  it("warns once per invocation: a child that inherits the env is silent", () => {
    const env: Record<string, string | undefined> = {
      [UNIFORM_RUNNERS]: "false",
    };
    expect(collect(env)).toHaveLength(1);
    expect(env[RETIRED_FLAGS_WARNED_ENV]).toBe("1");
    expect(collect({ ...env })).toEqual([]);
  });

  it("writes the warning to stderr by default", () => {
    const calls: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => calls.push(args);
    try {
      checkRetiredFlags({ [UNIFORM_RUNNERS]: "false" });
    } finally {
      console.warn = original;
    }
    expect(calls).toHaveLength(1);
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
});
