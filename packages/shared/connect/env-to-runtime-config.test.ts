import { describe, it, expect } from "vitest";
import { ENV_SEEDING_RULES, applyEnvSeeding } from "./env-to-runtime-config.js";
import type { PHConnectRuntimeConfig } from "../clis/types.js";

describe("ENV_SEEDING_RULES", () => {
  it("registers DISABLE_ADD_DRIVE -> drives.allowAddDrive (inverted)", () => {
    const rule = ENV_SEEDING_RULES.find(
      (r) => r.envVar === "PH_CONNECT_DISABLE_ADD_DRIVE",
    );
    expect(rule).toBeDefined();
    expect(rule?.path).toBe("drives.allowAddDrive");
    expect(rule?.parse("true")).toBe(false);
    expect(rule?.parse("false")).toBe(true);
    expect(rule?.parse("anything-else")).toBe(true);
  });

  it("registers DEFAULT_DRIVES_URL -> drives.defaultDrives", () => {
    const rule = ENV_SEEDING_RULES.find(
      (r) => r.envVar === "PH_CONNECT_DEFAULT_DRIVES_URL",
    );
    expect(rule).toBeDefined();
    expect(rule?.path).toBe("drives.defaultDrives");
    expect(rule?.parse("https://a.com, https://b.com,,")).toEqual([
      { url: "https://a.com", name: null, icon: null },
      { url: "https://b.com", name: null, icon: null },
    ]);
  });

  // Task 9: expanded rules — verify path + parser for every §B audit MIGRATE env.
  it.each([
    ["PH_CONNECT_BASE_PATH", "app.basePath", "/foo", "/foo"],
    ["PH_CONNECT_LOG_LEVEL", "app.logLevel", "debug", "debug"],
    [
      "PH_CONNECT_EXTERNAL_PACKAGES_DISABLED",
      "packages.externalEnabled",
      "true",
      false,
    ],
    [
      "PH_CONNECT_DRIVES_PRESERVE_STRATEGY",
      "drives.preserveStrategy",
      "preserve-all",
      "preserve-all",
    ],
    [
      "PH_CONNECT_PUBLIC_DRIVES_ENABLED",
      "drives.sections.remote.enabled",
      "true",
      true,
    ],
    [
      "PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES",
      "drives.sections.remote.allowAdd",
      "true",
      false,
    ],
    [
      "PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES",
      "drives.sections.remote.allowDelete",
      "true",
      false,
    ],
    [
      "PH_CONNECT_LOCAL_DRIVES_ENABLED",
      "drives.sections.local.enabled",
      "false",
      false,
    ],
    [
      "PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES",
      "drives.sections.local.allowAdd",
      "false",
      true,
    ],
    [
      "PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES",
      "drives.sections.local.allowDelete",
      "false",
      true,
    ],
    ["PH_CONNECT_RENOWN_URL", "renown.url", "https://x", "https://x"],
    ["PH_CONNECT_RENOWN_NETWORK_ID", "renown.networkId", "eip155", "eip155"],
    ["PH_CONNECT_RENOWN_CHAIN_ID", "renown.chainId", "42", 42],
  ])("registers %s -> %s with the right parser", (envVar, path, raw, want) => {
    const rule = ENV_SEEDING_RULES.find((r) => r.envVar === envVar);
    expect(rule).toBeDefined();
    expect(rule?.path).toBe(path);
    expect(rule?.parse(raw)).toEqual(want);
  });

  it("RENOWN_CHAIN_ID parser throws on non-numeric values", () => {
    const rule = ENV_SEEDING_RULES.find(
      (r) => r.envVar === "PH_CONNECT_RENOWN_CHAIN_ID",
    );
    expect(() => rule?.parse("not-a-number")).toThrow(/Cannot parse/);
  });
});

describe("applyEnvSeeding", () => {
  const env = (
    overrides: Record<string, string | undefined> = {},
  ): Readonly<Record<string, string | undefined>> => overrides;

  it("seeds an absent path from a set env var", () => {
    const { connect, seeded } = applyEnvSeeding(
      {} as PHConnectRuntimeConfig,
      env({ PH_CONNECT_DISABLE_ADD_DRIVE: "true" }),
    );
    expect(connect).toEqual({ drives: { allowAddDrive: false } });
    expect(seeded).toEqual([
      {
        envVar: "PH_CONNECT_DISABLE_ADD_DRIVE",
        path: "drives.allowAddDrive",
        value: false,
      },
    ]);
  });

  it("does not override an existing field even when env is set", () => {
    const base: PHConnectRuntimeConfig = {
      drives: { allowAddDrive: true },
    };
    const { connect, seeded } = applyEnvSeeding(
      base,
      env({ PH_CONNECT_DISABLE_ADD_DRIVE: "true" }),
    );
    expect(connect.drives?.allowAddDrive).toBe(true);
    expect(seeded).toHaveLength(0);
  });

  it("treats empty env value as unset", () => {
    const { connect, seeded } = applyEnvSeeding(
      {} as PHConnectRuntimeConfig,
      env({ PH_CONNECT_DISABLE_ADD_DRIVE: "" }),
    );
    expect(connect).toEqual({});
    expect(seeded).toHaveLength(0);
  });

  it("does not mutate the input object", () => {
    const base = { drives: { allowAddDrive: true } } as PHConnectRuntimeConfig;
    const before = JSON.stringify(base);
    applyEnvSeeding(base, env({ PH_CONNECT_DEFAULT_DRIVES_URL: "https://x" }));
    expect(JSON.stringify(base)).toBe(before);
  });

  it("seeds defaultDrives when absent", () => {
    const { connect, seeded } = applyEnvSeeding(
      {} as PHConnectRuntimeConfig,
      env({ PH_CONNECT_DEFAULT_DRIVES_URL: "https://a.com,https://b.com" }),
    );
    expect(connect.drives?.defaultDrives).toEqual([
      { url: "https://a.com", name: null, icon: null },
      { url: "https://b.com", name: null, icon: null },
    ]);
    expect(seeded[0]?.envVar).toBe("PH_CONNECT_DEFAULT_DRIVES_URL");
  });

  it("does not seed defaultDrives when an empty array exists in the file", () => {
    const base: PHConnectRuntimeConfig = {
      drives: { defaultDrives: [] },
    };
    const { connect, seeded } = applyEnvSeeding(
      base,
      env({ PH_CONNECT_DEFAULT_DRIVES_URL: "https://a.com" }),
    );
    expect(connect.drives?.defaultDrives).toEqual([]);
    expect(seeded).toHaveLength(0);
  });

  it("applies multiple rules in one pass", () => {
    const { connect, seeded } = applyEnvSeeding(
      {} as PHConnectRuntimeConfig,
      env({
        PH_CONNECT_DISABLE_ADD_DRIVE: "true",
        PH_CONNECT_DEFAULT_DRIVES_URL: "https://a.com",
      }),
    );
    expect(connect.drives?.allowAddDrive).toBe(false);
    expect(connect.drives?.defaultDrives).toEqual([
      { url: "https://a.com", name: null, icon: null },
    ]);
    expect(seeded.map((s) => s.envVar).sort()).toEqual([
      "PH_CONNECT_DEFAULT_DRIVES_URL",
      "PH_CONNECT_DISABLE_ADD_DRIVE",
    ]);
  });

  it("accepts custom rules", () => {
    const { connect, seeded } = applyEnvSeeding(
      {} as PHConnectRuntimeConfig,
      env({ FOO: "bar" }),
      [
        {
          envVar: "FOO",
          path: "branding.appName",
          parse: (v) => v.toUpperCase(),
        },
      ],
    );
    expect(connect.branding?.appName).toBe("BAR");
    expect(seeded[0]).toEqual({
      envVar: "FOO",
      path: "branding.appName",
      value: "BAR",
    });
  });
});
