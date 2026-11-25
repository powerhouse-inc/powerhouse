import { describe, expect, it } from "vitest";
import {
  checkDeprecatedFlags,
  connectChromeConfigKeys,
  deprecatedFlags,
  deprecationWarned,
  DEPRECATIONS_WARNED_ENV,
  findDeprecatedFlags,
  markDeprecationWarned,
  MIGRATION_GUIDE_URL,
  presentConfigKeys,
  supersededConfigKeys,
  supersededConfigKeysError,
  warnDeprecations,
  type DeprecatedFlag,
  type Deprecation,
} from "./deprecations.js";

const GOING = "FEATURE_GOING_ENABLED";

function collect(
  env: Record<string, string | undefined>,
  flags?: readonly DeprecatedFlag[],
): string[] {
  const warnings: string[] = [];
  checkDeprecatedFlags(env, flags, (text) => warnings.push(text));
  return warnings;
}

describe("deprecations: one warning per id and invocation", () => {
  const first: Deprecation = { id: "a", text: "A goes in 6.4." };
  const second: Deprecation = { id: "b", text: "B goes in 6.4." };

  it("prints the text with the migration link", () => {
    const warnings: string[] = [];
    warnDeprecations([first], {}, (text) => warnings.push(text));
    expect(warnings).toEqual([
      `Warning: A goes in 6.4. See ${MIGRATION_GUIDE_URL}`,
    ]);
  });

  it("warns once per id", () => {
    const env: Record<string, string | undefined> = {};
    const warnings: string[] = [];
    const warn = (text: string) => warnings.push(text);
    expect(warnDeprecations([first, first], env, warn)).toEqual([first]);
    expect(warnDeprecations([first, second], env, warn)).toEqual([second]);
    expect(warnings).toHaveLength(2);
    expect(env[DEPRECATIONS_WARNED_ENV]).toBe("a,b");
  });

  it("a child that inherits the env is silent", () => {
    const env: Record<string, string | undefined> = {};
    warnDeprecations([first], env, () => undefined);
    const warnings: string[] = [];
    warnDeprecations([first], { ...env }, (text) => warnings.push(text));
    expect(warnings).toEqual([]);
  });

  it("marks and reads an id without printing", () => {
    const env: Record<string, string | undefined> = {};
    expect(deprecationWarned("a", env)).toBe(false);
    markDeprecationWarned("a", env);
    markDeprecationWarned("a", env);
    expect(env[DEPRECATIONS_WARNED_ENV]).toBe("a");
    expect(deprecationWarned("a", env)).toBe(true);
    expect(deprecationWarned("b", env)).toBe(false);
  });

  it("writes the warning to stderr by default", () => {
    const calls: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => calls.push(args);
    try {
      warnDeprecations([first], {});
    } finally {
      console.warn = original;
    }
    expect(calls).toHaveLength(1);
  });
});

describe("deprecated flags", () => {
  const going: DeprecatedFlag = {
    name: GOING,
    when: "false",
    message: "Use `runner.plugins` in hosts/switchboard/host.js instead.",
  };

  it("FEATURE_PLUGIN_HOST_ENABLED left the table: it is retired", () => {
    expect(
      deprecatedFlags.find((f) => f.name === "FEATURE_PLUGIN_HOST_ENABLED"),
    ).toBeUndefined();
    expect(collect({ FEATURE_PLUGIN_HOST_ENABLED: "false" })).toEqual([]);
  });

  it.each(["false", "0", "off", "no", "FALSE", " no "])(
    "warns once for %j",
    (value) => {
      const warnings = collect({ [GOING]: value }, [going]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(`${GOING}=${value} stops working in 6.4.`);
      expect(warnings[0]).toContain("`runner.plugins`");
      expect(warnings[0]).toContain("hosts/switchboard/host.js");
      expect(warnings[0]).toContain(MIGRATION_GUIDE_URL);
    },
  );

  it.each(["1", "true", "TRUE", "on", "yes", ""])(
    "stays silent for %j",
    (value) => {
      expect(collect({ [GOING]: value }, [going])).toEqual([]);
    },
  );

  it("stays silent when the variable is unset", () => {
    expect(collect({}, [going])).toEqual([]);
  });

  it("has no entry for the switches that stay", () => {
    const env = { MCP_ENABLED: "false", PH_WORKFLOWS_ENABLED: "false" };
    expect(collect(env)).toEqual([]);
  });

  it("warns once per invocation: a child that inherits the env is silent", () => {
    const env: Record<string, string | undefined> = { [GOING]: "false" };
    expect(collect(env, [going])).toHaveLength(1);
    expect(collect({ ...env }, [going])).toEqual([]);
  });

  it("an entry with when: set triggers on any non-empty value", () => {
    const any: DeprecatedFlag = {
      name: "FEATURE_GOING",
      when: "set",
      message: "Use the host file instead.",
    };
    expect(findDeprecatedFlags({ FEATURE_GOING: "true" }, [any])).toEqual([
      {
        id: "flag:FEATURE_GOING",
        text: "FEATURE_GOING=true stops working in 6.4. Use the host file instead.",
      },
    ]);
    expect(findDeprecatedFlags({ FEATURE_GOING: "" }, [any])).toEqual([]);
  });
});

describe("deprecations: powerhouse.config.json keys", () => {
  it("finds the superseded keys a config sets", () => {
    const config = {
      studio: { port: 3000, openBrowser: true },
      reactor: { port: 4001, storage: { type: "filesystem" } },
    };
    expect(
      presentConfigKeys(config, Object.keys(supersededConfigKeys)),
    ).toEqual(["studio.openBrowser", "reactor.storage"]);
  });

  it("words the error for a project that still sets superseded keys", () => {
    expect(
      supersededConfigKeysError(["reactor.https", "studio.https"]).split(
        String.fromCharCode(10),
      ),
    ).toEqual([
      'powerhouse.config.json "reactor.https" was removed in 6.4. ' +
        "Set config.switchboard.server.https in hosts/switchboard/host.js and remove the key.",
      'powerhouse.config.json "studio.https" was removed in 6.4. ' +
        "No host setting replaces it: remove the key.",
      "`ph migrate` moves the keys it can and says what to do with the rest. " +
        `See ${MIGRATION_GUIDE_URL}`,
    ]);
  });

  it("names where every superseded key but studio.https lives now", () => {
    for (const [key, home] of Object.entries(supersededConfigKeys)) {
      if (key === "studio.https") expect(home).toBeNull();
      else expect(home, key).toContain("/host.js");
    }
  });

  it("finds the Connect chrome keys a config sets", () => {
    const config = {
      connect: { drives: { allowAddDrive: false }, home: { background: "x" } },
    };
    expect(presentConfigKeys(config, connectChromeConfigKeys)).toEqual([
      "connect.drives.allowAddDrive",
      "connect.home.background",
    ]);
  });

  it("names none of the keys the scaffolded host files reference", () => {
    const config = {
      studio: { port: 3000 },
      reactor: { port: 4001 },
      vetra: { connectPort: 3001 },
      assistant: { port: 4010 },
      connect: { reactor: { createSignaturePolicy: "v2-required" } },
    };
    expect(
      presentConfigKeys(config, Object.keys(supersededConfigKeys)),
    ).toEqual([]);
    expect(presentConfigKeys(config, connectChromeConfigKeys)).toEqual([]);
    expect(presentConfigKeys(undefined, connectChromeConfigKeys)).toEqual([]);
  });
});
