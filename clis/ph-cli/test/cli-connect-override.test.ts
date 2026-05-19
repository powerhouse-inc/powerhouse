import { describe, expect, it } from "vitest";
import { buildCliConnectOverride } from "../src/utils/cli-connect-override.js";
import type { ConnectBuildArgs } from "../src/types.js";

function mk(partial: Partial<ConnectBuildArgs>): ConnectBuildArgs {
  // Minimal stub — only the runtime-override fields the helper reads matter.
  // The rest of ConnectBuildArgs is shaped but irrelevant for this unit.
  return {
    outDir: "dist",
    json: undefined,
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
    ...partial,
  } as ConnectBuildArgs;
}

describe("buildCliConnectOverride", () => {
  it("returns undefined when no --json and no flags are set", () => {
    expect(buildCliConnectOverride(mk({}))).toBeUndefined();
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
      renown: { url: "https://x", chainId: 42 },
      packages: { externalEnabled: false },
      drives: {
        allowAddDrive: false,
        sections: {
          remote: { enabled: true },
          local: { allowDelete: false },
        },
      },
    });
  });

  it("parses --json as a partial connect.* blob", () => {
    const result = buildCliConnectOverride(
      mk({ json: '{"renown":{"url":"https://from-json"}}' }),
    );
    expect(result).toEqual({ renown: { url: "https://from-json" } });
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
      renown: { url: "https://from-flag", networkId: "from-json" },
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
    expect(result).toEqual({ renown: { url: "https://x" } });
  });
});
