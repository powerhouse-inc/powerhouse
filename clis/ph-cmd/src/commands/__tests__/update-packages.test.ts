import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as semver from "semver";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyVersionBumps,
  findOutdatedPackages,
  isDistTag,
  pickLatestSameLine,
  updateInstalledPackages,
  type ConfigPackage,
  type OutdatedPackage,
} from "../update-packages.js";

const CONFIG = "powerhouse.config.json";

describe("isDistTag", () => {
  it("treats non-semver strings as dist-tags", () => {
    expect(isDistTag("dev", semver)).toBe(true);
    expect(isDistTag("staging", semver)).toBe(true);
    expect(isDistTag("latest", semver)).toBe(true);
    expect(isDistTag("rc", semver)).toBe(true);
  });

  it("treats concrete semver versions as not tags", () => {
    expect(isDistTag("1.2.3", semver)).toBe(false);
    expect(isDistTag("0.0.1", semver)).toBe(false);
    expect(isDistTag("10.4.2", semver)).toBe(false);
  });
});

describe("findOutdatedPackages", () => {
  it("skips dist-tag packages without resolving them", async () => {
    const resolveLatest = vi.fn(() => Promise.resolve("9.9.9"));
    const result = await findOutdatedPackages(
      [{ packageName: "@a/pkg", version: "dev" }],
      resolveLatest,
    );
    expect(result).toEqual([]);
    expect(resolveLatest).not.toHaveBeenCalled();
  });

  it("reports a pinned package when a newer version is available", async () => {
    const resolveLatest = vi.fn(() => Promise.resolve("1.5.0"));
    const result = await findOutdatedPackages(
      [{ packageName: "@a/pkg", version: "1.2.3" }],
      resolveLatest,
    );
    expect(result).toEqual([
      {
        name: "@a/pkg",
        currentVersion: "1.2.3",
        newVersion: "1.5.0",
        provider: "registry",
      },
    ]);
  });

  it("does not report a package already at the resolved version", async () => {
    const resolveLatest = vi.fn(() => Promise.resolve("1.5.0"));
    const result = await findOutdatedPackages(
      [{ packageName: "@a/pkg", version: "1.5.0" }],
      resolveLatest,
    );
    expect(result).toEqual([]);
  });

  it("preserves the local provider on the reported package", async () => {
    const resolveLatest = vi.fn(() => Promise.resolve("1.9.0"));
    const result = await findOutdatedPackages(
      [{ packageName: "@a/pkg", version: "1.2.3", provider: "local" }],
      resolveLatest,
    );
    expect(result[0]?.provider).toBe("local");
  });
});

describe("applyVersionBumps", () => {
  it("bumps only the requested packages and preserves other fields", () => {
    const config: { packages?: ConfigPackage[] } = {
      packages: [
        {
          packageName: "@a/pkg",
          version: "1.2.3",
          provider: "local",
          extra: "keep",
        },
        { packageName: "@b/pkg", version: "2.0.0", provider: "registry" },
      ],
    };
    applyVersionBumps(config, [{ name: "@a/pkg", newVersion: "1.9.0" }]);
    expect(config.packages?.[0]).toEqual({
      packageName: "@a/pkg",
      version: "1.9.0",
      provider: "local",
      extra: "keep",
    });
    expect(config.packages?.[1]).toEqual({
      packageName: "@b/pkg",
      version: "2.0.0",
      provider: "registry",
    });
  });

  it("leaves the config unchanged when there are no updates", () => {
    const config = { packages: [{ packageName: "@a/pkg", version: "1.0.0" }] };
    applyVersionBumps(config, []);
    expect(config.packages[0]?.version).toBe("1.0.0");
  });
});

describe("pickLatestSameLine", () => {
  const cases: Array<[string, string[], string | null]> = [
    // stable stays stable
    ["6.2.3", ["6.2.3", "6.2.4", "6.3.0-dev.8", "6.4.0-next.0"], "6.2.4"],
    ["6.2.3", ["6.2.3", "6.3.0-dev.8"], null],
    // dev stays on dev
    [
      "6.3.0-dev.6",
      ["6.2.4", "6.3.0", "6.3.0-dev.8", "6.4.0-next.0"],
      "6.3.0-dev.8",
    ],
    // next stays on next, across base versions within the major
    [
      "6.4.0-next.1",
      ["6.4.0", "6.4.0-dev.3", "6.4.0-next.2", "6.4.1-next.0"],
      "6.4.1-next.0",
    ],
    ["6.4.0-next.1", ["6.4.0-next.9", "6.4.0-next.10"], "6.4.0-next.10"],
    ["6.4.0-next.1", ["6.4.0-next.1"], null],
    ["6.4.0-next.1", ["7.0.0-next.0"], null],
    // other pre-release lines
    ["6.2.3-staging.0", ["6.2.3-staging.1", "6.2.4"], "6.2.3-staging.1"],
    ["6.2.0-rc.8", ["6.2.0", "6.3.0-rc.0"], "6.3.0-rc.0"],
    ["6.2.3-dev.56", ["6.2.3-dev.57", "6.2.3-debug.1"], "6.2.3-dev.57"],
    ["1.0.0-alpha.1", ["1.0.0-beta.0"], null],
    ["0.0.2", ["0.0.3", "0.1.0-dev.113", "6.4.0-next.0"], "0.0.3"],
    // input clean-up
    ["v6.2.3", ["6.2.4"], "6.2.4"],
    ["not-a-version", ["6.2.4"], null],
  ];

  it.each(cases)("%s among %j -> %s", (current, versions, expected) => {
    expect(pickLatestSameLine(current, versions, semver)).toBe(expected);
  });

  it("ignores entries that are not versions", () => {
    expect(pickLatestSameLine("6.2.3", ["latest", "", "6.2.5"], semver)).toBe(
      "6.2.5",
    );
  });
});

describe("updateInstalledPackages (orchestration)", () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), "ph-update-pkgs-"));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  function seedConfig(content: unknown): void {
    writeFileSync(
      join(projectPath, CONFIG),
      JSON.stringify(content, null, 2),
      "utf-8",
    );
  }

  function readConfig(): {
    packages?: { packageName: string; version: string; provider?: string }[];
  } {
    return JSON.parse(readFileSync(join(projectPath, CONFIG), "utf-8")) as {
      packages?: { packageName: string; version: string; provider?: string }[];
    };
  }

  it("in --update-packages mode bumps every outdated package and updates local ones via the package manager", async () => {
    seedConfig({
      packages: [
        { packageName: "@a/pkg", version: "1.0.0", provider: "registry" },
        { packageName: "@b/pkg", version: "1.0.0", provider: "local" },
      ],
    });
    const resolveLatest = vi.fn((name: string) =>
      Promise.resolve(name === "@a/pkg" ? "1.4.2" : "1.7.0"),
    );
    const runCommand = vi.fn();

    const localBumped = await updateInstalledPackages({
      auto: true,
      skipInstall: false,
      packageManager: { agent: "pnpm" },
      configPath: join(projectPath, CONFIG),
      runCommand,
      resolveLatest,
    });

    const config = readConfig();
    expect(
      config.packages?.find((p) => p.packageName === "@a/pkg")?.version,
    ).toBe("1.4.2");
    expect(
      config.packages?.find((p) => p.packageName === "@b/pkg")?.version,
    ).toBe("1.7.0");
    // the local provider is preserved on the bumped entry
    expect(
      config.packages?.find((p) => p.packageName === "@b/pkg")?.provider,
    ).toBe("local");
    // <pm> update runs only for the local package
    expect(runCommand).toHaveBeenCalledWith("pnpm update @b/pkg");
    expect(localBumped).toEqual(["@b/pkg"]);
  });

  it("does not run the package manager when skipInstall is set (config still bumped)", async () => {
    seedConfig({
      packages: [
        { packageName: "@b/pkg", version: "1.0.0", provider: "local" },
      ],
    });
    const resolveLatest = vi.fn(() => Promise.resolve("1.3.0"));
    const runCommand = vi.fn();

    await updateInstalledPackages({
      auto: true,
      skipInstall: true,
      packageManager: { agent: "pnpm" },
      configPath: join(projectPath, CONFIG),
      runCommand,
      resolveLatest,
    });

    expect(readConfig().packages?.[0]?.version).toBe("1.3.0");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("in prompt mode updates only the packages the user accepts", async () => {
    seedConfig({
      packages: [
        { packageName: "@a/pkg", version: "1.0.0", provider: "registry" },
        { packageName: "@b/pkg", version: "1.0.0", provider: "registry" },
      ],
    });
    const resolveLatest = vi.fn((name: string) =>
      Promise.resolve(name === "@a/pkg" ? "1.2.0" : "1.5.0"),
    );
    const prompt = vi.fn((outdated: OutdatedPackage[]) =>
      Promise.resolve(outdated.filter((p) => p.name === "@a/pkg")),
    );
    const runCommand = vi.fn();

    await updateInstalledPackages({
      auto: false,
      skipInstall: false,
      packageManager: null,
      configPath: join(projectPath, CONFIG),
      runCommand,
      resolveLatest,
      prompt,
    });

    const config = readConfig();
    expect(
      config.packages?.find((p) => p.packageName === "@a/pkg")?.version,
    ).toBe("1.2.0");
    // the unaccepted package is left untouched
    expect(
      config.packages?.find((p) => p.packageName === "@b/pkg")?.version,
    ).toBe("1.0.0");
    expect(runCommand).not.toHaveBeenCalled();
  });
});
