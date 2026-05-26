import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildCliConnectOverride,
  wasFlagExplicitlyPassed,
} from "../src/utils/cli-connect-override.js";
import type { ConnectBuildArgs } from "../src/types.js";

function mk(partial: Partial<ConnectBuildArgs>): ConnectBuildArgs {
  // Minimal stub — covers every field buildCliConnectOverride reads. The 4
  // commonArgs flags carry cmd-ts defaults at runtime; we set those defaults
  // here so the explicit-set gating (which inspects process.argv) governs
  // whether they reach the override.
  return {
    outDir: "dist",
    json: undefined,
    // strict-optional flags from connectRuntimeOverrideArgs.
    renownUrl: undefined,
    renownNetworkId: undefined,
    renownChainId: undefined,
    allowAddDrive: undefined,
    externalPackages: undefined,
    remoteDrivesEnabled: undefined,
    remoteDrivesAllowAdd: undefined,
    remoteDrivesAllowDelete: undefined,
    localDrivesEnabled: undefined,
    localDrivesAllowAdd: undefined,
    localDrivesAllowDelete: undefined,
    packagesRegistry: undefined,
    appName: undefined,
    homeBackground: undefined,
    sentryDsn: undefined,
    sentryEnv: undefined,
    sentryTracingEnabled: undefined,
    // commonArgs flags with their cmd-ts defaults applied.
    connectBasePath: "/",
    logLevel: "info",
    defaultDrivesUrl: "",
    drivesPreserveStrategy: "preserve-by-url-and-detach",
    ...partial,
  } as ConnectBuildArgs;
}

describe("wasFlagExplicitlyPassed", () => {
  let originalArgv: string[];
  beforeEach(() => {
    originalArgv = process.argv;
  });
  afterEach(() => {
    process.argv = originalArgv;
  });

  it("returns true for `--flag value` form", () => {
    process.argv = ["node", "cli", "--base", "/foo"];
    expect(wasFlagExplicitlyPassed("base")).toBe(true);
  });

  it("returns true for `--flag=value` form", () => {
    process.argv = ["node", "cli", "--base=/foo"];
    expect(wasFlagExplicitlyPassed("base")).toBe(true);
  });

  it("returns false when flag is absent", () => {
    process.argv = ["node", "cli", "--other-flag", "x"];
    expect(wasFlagExplicitlyPassed("base")).toBe(false);
  });
});

describe("buildCliConnectOverride", () => {
  let originalArgv: string[];
  beforeEach(() => {
    originalArgv = process.argv;
    // Default: pretend no flags passed (commonArgs defaults shouldn't leak).
    process.argv = ["node", "cli"];
  });
  afterEach(() => {
    process.argv = originalArgv;
  });

  it("returns undefined overrides when no --json and no flags are set", () => {
    expect(buildCliConnectOverride(mk({}))).toEqual({
      connectOverride: undefined,
      packageRegistryUrl: undefined,
    });
  });

  it("packs individual flags into the right paths", () => {
    const result = buildCliConnectOverride(
      mk({
        renownUrl: "https://x",
        renownChainId: 42,
        allowAddDrive: false,
        externalPackages: false,
        remoteDrivesEnabled: true,
        localDrivesAllowDelete: false,
      }),
    );
    expect(result).toEqual({
      connectOverride: {
        renown: { url: "https://x", chainId: 42 },
        packages: { externalEnabled: false },
        drives: {
          allowAddDrive: false,
          sections: {
            remote: { enabled: true },
            local: { allowDelete: false },
          },
        },
      },
      packageRegistryUrl: undefined,
    });
  });

  it("routes --packages-registry to top-level packageRegistryUrl", () => {
    const result = buildCliConnectOverride(
      mk({
        packagesRegistry: "https://registry.example",
        appName: "Custom App",
        homeBackground: "https://bg.example/img.png",
      }),
    );
    expect(result).toEqual({
      connectOverride: {
        branding: {
          appName: "Custom App",
          homeBackground: "https://bg.example/img.png",
        },
      },
      packageRegistryUrl: "https://registry.example",
    });
  });

  it("home-background empty string sets branding.homeBackground to null", () => {
    const result = buildCliConnectOverride(mk({ homeBackground: "" }));
    expect(result).toEqual({
      connectOverride: { branding: { homeBackground: null } },
      packageRegistryUrl: undefined,
    });
  });

  it("does NOT leak commonArgs flag defaults when not explicitly passed", () => {
    // process.argv has no --base, --log-level, etc. Their cmd-ts defaults
    // (`/`, `info`, etc.) must not appear in the override.
    expect(buildCliConnectOverride(mk({}))).toEqual({
      connectOverride: undefined,
      packageRegistryUrl: undefined,
    });
  });

  it("forwards --base into cliConnectOverride when explicitly passed", () => {
    process.argv = ["node", "cli", "--base", "/subpath"];
    const result = buildCliConnectOverride(mk({ connectBasePath: "/subpath" }));
    expect(result).toEqual({
      connectOverride: { app: { basePath: "/subpath" } },
      packageRegistryUrl: undefined,
    });
  });

  it("forwards --log-level into cliConnectOverride when explicitly passed", () => {
    process.argv = ["node", "cli", "--log-level", "debug"];
    const result = buildCliConnectOverride(mk({ logLevel: "debug" }));
    expect(result).toEqual({
      connectOverride: { app: { logLevel: "debug" } },
      packageRegistryUrl: undefined,
    });
  });

  it("parses --default-drives-url comma-list when explicitly passed", () => {
    process.argv = [
      "node",
      "cli",
      "--default-drives-url",
      "https://a.com, https://b.com",
    ];
    const result = buildCliConnectOverride(
      mk({ defaultDrivesUrl: "https://a.com, https://b.com" }),
    );
    expect(result).toEqual({
      connectOverride: {
        drives: {
          defaultDrives: [
            { url: "https://a.com", name: null, icon: null },
            { url: "https://b.com", name: null, icon: null },
          ],
        },
      },
      packageRegistryUrl: undefined,
    });
  });

  it("forwards --drive-preserve-strategy when explicitly passed", () => {
    process.argv = ["node", "cli", "--drive-preserve-strategy", "preserve-all"];
    const result = buildCliConnectOverride(
      mk({ drivesPreserveStrategy: "preserve-all" }),
    );
    expect(result).toEqual({
      connectOverride: { drives: { preserveStrategy: "preserve-all" } },
      packageRegistryUrl: undefined,
    });
  });

  it("parses --json as a partial connect.* blob", () => {
    const result = buildCliConnectOverride(
      mk({ json: '{"renown":{"url":"https://from-json"}}' }),
    );
    expect(result).toEqual({
      connectOverride: { renown: { url: "https://from-json" } },
      packageRegistryUrl: undefined,
    });
  });

  it("--json top-level packageRegistryUrl routes to the top-level override", () => {
    const result = buildCliConnectOverride(
      mk({
        json: '{"packageRegistryUrl":"https://from-json","renown":{"url":"https://x"}}',
      }),
    );
    expect(result).toEqual({
      connectOverride: { renown: { url: "https://x" } },
      packageRegistryUrl: "https://from-json",
    });
  });

  it("--packages-registry flag beats --json's top-level packageRegistryUrl", () => {
    const result = buildCliConnectOverride(
      mk({
        json: '{"packageRegistryUrl":"https://from-json"}',
        packagesRegistry: "https://from-flag",
      }),
    );
    expect(result).toEqual({
      connectOverride: undefined,
      packageRegistryUrl: "https://from-flag",
    });
  });

  it("individual flags beat --json on collision", () => {
    const result = buildCliConnectOverride(
      mk({
        json: '{"renown":{"url":"https://from-json","networkId":"from-json"}}',
        renownUrl: "https://from-flag",
      }),
    );
    // url overridden by flag, networkId comes from json (no flag override)
    expect(result).toEqual({
      connectOverride: {
        renown: { url: "https://from-flag", networkId: "from-json" },
      },
      packageRegistryUrl: undefined,
    });
  });

  it("throws on malformed --json with a clear actionable message", () => {
    expect(() => buildCliConnectOverride(mk({ json: "not-json" }))).toThrow(
      /invalid JSON/,
    );
  });

  it("throws when --json payload is not an object", () => {
    expect(() => buildCliConnectOverride(mk({ json: '"a string"' }))).toThrow(
      /must be a JSON object/,
    );
    expect(() => buildCliConnectOverride(mk({ json: "[1,2,3]" }))).toThrow(
      /must be a JSON object/,
    );
  });

  it("treats undefined json as no override", () => {
    const result = buildCliConnectOverride(
      mk({ json: undefined, renownUrl: "https://x" }),
    );
    expect(result).toEqual({
      connectOverride: { renown: { url: "https://x" } },
      packageRegistryUrl: undefined,
    });
  });

  it("routes --sentry-dsn / --sentry-env / --sentry-tracing-enabled into connect.sentry", () => {
    const result = buildCliConnectOverride(
      mk({
        sentryDsn: "https://example@sentry.io/1",
        sentryEnv: "staging",
        sentryTracingEnabled: true,
      }),
    );
    expect(result).toEqual({
      connectOverride: {
        sentry: {
          dsn: "https://example@sentry.io/1",
          env: "staging",
          tracing: true,
        },
      },
      packageRegistryUrl: undefined,
    });
  });

  it("--sentry-dsn '' (empty string) sets dsn null to disable Sentry", () => {
    const result = buildCliConnectOverride(mk({ sentryDsn: "" }));
    expect(result).toEqual({
      connectOverride: { sentry: { dsn: null } },
      packageRegistryUrl: undefined,
    });
  });
});
