// Focused tests for `runConnectBuild` guard logic. We don't actually invoke
// vite here — the goal is to verify the positional-arity guard fires before
// any heavy build work runs.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanDistExcept,
  isVendorEnabled,
  runConnectBuild,
} from "../src/services/connect-build.js";
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
describe("isVendorEnabled", () => {
  it("defaults to enabled when the env var is unset", () => {
    expect(isVendorEnabled({})).toBe(true);
  });

  it("disables on 0", () => {
    expect(isVendorEnabled({ PH_CONNECT_VENDOR: "0" })).toBe(false);
  });

  it("disables on false", () => {
    expect(isVendorEnabled({ PH_CONNECT_VENDOR: "false" })).toBe(false);
  });

  it("stays enabled on 1 / true / other values", () => {
    expect(isVendorEnabled({ PH_CONNECT_VENDOR: "1" })).toBe(true);
    expect(isVendorEnabled({ PH_CONNECT_VENDOR: "true" })).toBe(true);
    expect(isVendorEnabled({ PH_CONNECT_VENDOR: "yes" })).toBe(true);
  });
});

describe("cleanDistExcept", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function mkDist(entries: string[]): string {
    const dir = mkdtempSync(join(tmpdir(), "ph-clean-dist-"));
    dirs.push(dir);
    for (const e of entries) {
      const p = join(dir, e);
      writeFileSync(p, "x");
    }
    return dir;
  }

  it("keeps the named entries and removes the rest", () => {
    const dir = mkDist([
      "assets",
      "index.html",
      "build-hash.json",
      "__vendor__",
    ]);
    const removed = cleanDistExcept(dir, ["__vendor__"]);
    expect(removed).toBe(3);
    expect(existsSync(join(dir, "__vendor__"))).toBe(true);
    expect(existsSync(join(dir, "assets"))).toBe(false);
    expect(existsSync(join(dir, "index.html"))).toBe(false);
  });

  it("returns 0 for a missing dist", () => {
    expect(
      cleanDistExcept(join(tmpdir(), "does-not-exist-12345"), ["__vendor__"]),
    ).toBe(0);
  });
});
