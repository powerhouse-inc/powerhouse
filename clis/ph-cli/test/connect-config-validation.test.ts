import { describe, expect, it } from "vitest";
import {
  buildConnectFlagPatch,
  type ConnectFlagInput,
} from "../src/utils/cli-connect-override.js";
import {
  normalizeKey,
  validateConnectPatch,
} from "../src/utils/connect-config-validation.js";

describe("normalizeKey", () => {
  it("strips the optional connect. prefix", () => {
    expect(normalizeKey("connect.renown.url")).toBe("renown.url");
    expect(normalizeKey("renown.url")).toBe("renown.url");
  });
});

describe("buildConnectFlagPatch — 19 field flags", () => {
  it("returns an empty patch when no flag is set", () => {
    expect(buildConnectFlagPatch({})).toEqual({});
  });

  // The 15 strict-optional flags from connectRuntimeOverrideArgs.

  it("renownUrl → renown.url", () => {
    expect(buildConnectFlagPatch({ renownUrl: "https://x" })).toEqual({
      renown: { url: "https://x" },
    });
  });

  it("renownNetworkId → renown.networkId", () => {
    expect(buildConnectFlagPatch({ renownNetworkId: "eip155" })).toEqual({
      renown: { networkId: "eip155" },
    });
  });

  it("renownChainId → renown.chainId (number)", () => {
    expect(buildConnectFlagPatch({ renownChainId: 137 })).toEqual({
      renown: { chainId: 137 },
    });
  });

  it("allowAddDrive → drives.allowAddDrive (boolean)", () => {
    expect(buildConnectFlagPatch({ allowAddDrive: false })).toEqual({
      drives: { allowAddDrive: false },
    });
  });

  it("externalPackages → packages.externalEnabled", () => {
    expect(buildConnectFlagPatch({ externalPackages: false })).toEqual({
      packages: { externalEnabled: false },
    });
  });

  it("appName → branding.appName", () => {
    expect(buildConnectFlagPatch({ appName: "Custom App" })).toEqual({
      branding: { appName: "Custom App" },
    });
  });

  it("homeBackground → branding.homeBackground (URL string)", () => {
    expect(
      buildConnectFlagPatch({ homeBackground: "https://example.com/bg.png" }),
    ).toEqual({ branding: { homeBackground: "https://example.com/bg.png" } });
  });

  it("homeBackground (empty string) → branding.homeBackground: null", () => {
    expect(buildConnectFlagPatch({ homeBackground: "" })).toEqual({
      branding: { homeBackground: null },
    });
  });

  it("remoteDrivesEnabled → drives.sections.remote.enabled", () => {
    expect(buildConnectFlagPatch({ remoteDrivesEnabled: false })).toEqual({
      drives: { sections: { remote: { enabled: false } } },
    });
  });

  it("remoteDrivesAllowAdd → drives.sections.remote.allowAdd", () => {
    expect(buildConnectFlagPatch({ remoteDrivesAllowAdd: false })).toEqual({
      drives: { sections: { remote: { allowAdd: false } } },
    });
  });

  it("remoteDrivesAllowDelete → drives.sections.remote.allowDelete", () => {
    expect(buildConnectFlagPatch({ remoteDrivesAllowDelete: false })).toEqual({
      drives: { sections: { remote: { allowDelete: false } } },
    });
  });

  it("localDrivesEnabled → drives.sections.local.enabled", () => {
    expect(buildConnectFlagPatch({ localDrivesEnabled: false })).toEqual({
      drives: { sections: { local: { enabled: false } } },
    });
  });

  it("localDrivesAllowAdd → drives.sections.local.allowAdd", () => {
    expect(buildConnectFlagPatch({ localDrivesAllowAdd: false })).toEqual({
      drives: { sections: { local: { allowAdd: false } } },
    });
  });

  it("localDrivesAllowDelete → drives.sections.local.allowDelete", () => {
    expect(buildConnectFlagPatch({ localDrivesAllowDelete: false })).toEqual({
      drives: { sections: { local: { allowDelete: false } } },
    });
  });

  // The 4 commonArgs flags (callers must pre-filter via wasFlagExplicitlyPassed).

  it("basePath → app.basePath", () => {
    expect(buildConnectFlagPatch({ basePath: "/subpath" })).toEqual({
      app: { basePath: "/subpath" },
    });
  });

  it("logLevel → app.logLevel", () => {
    expect(buildConnectFlagPatch({ logLevel: "debug" })).toEqual({
      app: { logLevel: "debug" },
    });
  });

  it("defaultDrivesUrl → drives.defaultDrives (parsed)", () => {
    expect(
      buildConnectFlagPatch({
        defaultDrivesUrl: "https://a.com, https://b.com",
      }),
    ).toEqual({
      drives: {
        defaultDrives: [
          { url: "https://a.com", name: null, icon: null },
          { url: "https://b.com", name: null, icon: null },
        ],
      },
    });
  });

  it("defaultDrivesUrl (empty string) → no defaultDrives in patch", () => {
    expect(buildConnectFlagPatch({ defaultDrivesUrl: "" })).toEqual({});
  });

  it("drivesPreserveStrategy → drives.preserveStrategy", () => {
    expect(
      buildConnectFlagPatch({ drivesPreserveStrategy: "preserve-all" }),
    ).toEqual({ drives: { preserveStrategy: "preserve-all" } });
  });

  // Multi-flag patch — verifies the partial-merge structure.

  it("composes a multi-field patch correctly", () => {
    const input: ConnectFlagInput = {
      renownUrl: "https://x",
      renownChainId: 1,
      allowAddDrive: false,
      remoteDrivesEnabled: true,
      localDrivesEnabled: false,
      logLevel: "warn",
    };
    expect(buildConnectFlagPatch(input)).toEqual({
      app: { logLevel: "warn" },
      renown: { url: "https://x", chainId: 1 },
      drives: {
        allowAddDrive: false,
        sections: {
          remote: { enabled: true },
          local: { enabled: false },
        },
      },
    });
  });
});

describe("validateConnectPatch (--json path)", () => {
  it("validates and returns a well-shaped partial", () => {
    expect(
      validateConnectPatch('{"renown":{"url":"https://x","chainId":42}}'),
    ).toEqual({ renown: { url: "https://x", chainId: 42 } });
  });

  it("accepts a multi-section patch", () => {
    const raw =
      '{"drives":{"allowAddDrive":false,"sections":{"local":{"enabled":false}}},"renown":{"chainId":137}}';
    expect(validateConnectPatch(raw)).toEqual({
      drives: {
        allowAddDrive: false,
        sections: { local: { enabled: false } },
      },
      renown: { chainId: 137 },
    });
  });

  it("throws on malformed JSON", () => {
    expect(() => validateConnectPatch("not-json")).toThrow(/invalid JSON/);
  });

  it("throws on non-object root", () => {
    expect(() => validateConnectPatch('"a string"')).toThrow(
      /must be a JSON object/,
    );
    expect(() => validateConnectPatch("[1,2,3]")).toThrow(
      /must be a JSON object/,
    );
  });

  it("throws on unknown top-level key (catches typos)", () => {
    expect(() => validateConnectPatch('{"unknownKey":{"foo":"bar"}}')).toThrow(
      /must NOT have additional properties/,
    );
  });

  it("throws on type mismatch inside a known section", () => {
    expect(() => validateConnectPatch('{"renown":{"chainId":"abc"}}')).toThrow(
      /must be number/,
    );
  });

  it("accepts a top-level packageRegistryUrl alongside a connect.* blob", () => {
    // packageRegistryUrl is a top-level runtime field, not part of the
    // connect schema. The validator must strip it before checking
    // additionalProperties on the connect-only blob.
    expect(
      validateConnectPatch(
        '{"packageRegistryUrl":"https://reg.example","renown":{"url":"https://x"}}',
      ),
    ).toEqual({
      packageRegistryUrl: "https://reg.example",
      renown: { url: "https://x" },
    });
  });

  it("accepts a payload that is only a top-level packageRegistryUrl", () => {
    expect(
      validateConnectPatch('{"packageRegistryUrl":"https://reg.example"}'),
    ).toEqual({ packageRegistryUrl: "https://reg.example" });
  });

  it("still rejects unknown top-level keys other than packageRegistryUrl", () => {
    expect(() =>
      validateConnectPatch('{"unrelatedKey":"x","renown":{"url":"y"}}'),
    ).toThrow(/must NOT have additional properties/);
  });
});
