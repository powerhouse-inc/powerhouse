// Focused tests for `runConnectBuild` guard logic. We don't actually invoke
// vite here — the goal is to verify the positional-arity guard fires before
// any heavy build work runs.

import { describe, expect, it } from "vitest";
import { runConnectBuild } from "../src/services/connect-build.js";
import type { ConnectBuildArgs } from "../src/types.js";

function mk(partial: Partial<ConnectBuildArgs>): ConnectBuildArgs {
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
    packagesRegistry: undefined,
    appName: undefined,
    homeBackground: undefined,
    sentryDsn: undefined,
    sentryEnv: undefined,
    sentryTracingEnabled: undefined,
    keyPositional: undefined,
    valuePositional: undefined,
    connectBasePath: "/",
    logLevel: "info",
    defaultDrivesUrl: "",
    drivesPreserveStrategy: "preserve-by-url-and-detach",
    ...partial,
  } as ConnectBuildArgs;
}

describe("runConnectBuild positional guard", () => {
  it("throws an actionable error when only <key> is passed (no <value>)", async () => {
    await expect(
      runConnectBuild(mk({ keyPositional: "connect.renown.url" })),
    ).rejects.toThrow(/positional override requires both <key> and <value>/);
  });

  it("error message points users at `ph connect config <key>` for reads", async () => {
    await expect(
      runConnectBuild(mk({ keyPositional: "connect.renown.url" })),
    ).rejects.toThrow(/use `ph connect config <key>`/);
  });
});
