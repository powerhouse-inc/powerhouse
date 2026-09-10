import { describe, expect, it } from "vitest";
import { getUpdateTarget, parseInstallSpec } from "./updates.js";

describe("parseInstallSpec", () => {
  const cases: Array<
    [
      spec: string | undefined,
      expected: { kind: "tag" | "version"; value: string },
    ]
  > = [
    [undefined, { kind: "tag", value: "latest" }],
    ["my-pkg", { kind: "tag", value: "latest" }],
    ["my-pkg@dev", { kind: "tag", value: "dev" }],
    ["my-pkg@6.2.1", { kind: "version", value: "6.2.1" }],
    ["@scope/pkg", { kind: "tag", value: "latest" }],
    ["@scope/pkg@1.0.0", { kind: "version", value: "1.0.0" }],
    ["@scope/pkg@staging", { kind: "tag", value: "staging" }],
  ];

  for (const [spec, expected] of cases) {
    it(`${JSON.stringify(spec)} → ${expected.kind} "${expected.value}"`, () => {
      expect(parseInstallSpec(spec)).toEqual(expected);
    });
  }
});

describe("getUpdateTarget", () => {
  const cases: Array<{
    name: string;
    installed: { version?: string | null; spec?: string | null };
    info: {
      distTags?: Record<string, string> | null;
      latestVersion?: string | null;
    };
    expected: string | undefined;
  }> = [
    {
      name: "pinned 6.2.1 with newer latest → latest target",
      installed: { version: "6.2.1" },
      info: { distTags: { latest: "6.3.0" } },
      expected: "6.3.0",
    },
    {
      name: "latest equal to installed → undefined",
      installed: { version: "6.2.1" },
      info: { distTags: { latest: "6.2.1" } },
      expected: undefined,
    },
    {
      name: "installed ahead of latest (no downgrade) → undefined",
      installed: { version: "6.3.0" },
      info: { distTags: { latest: "6.2.1" } },
      expected: undefined,
    },
    {
      name: "follows the dev tag stream, not latest",
      installed: { version: "6.2.2-dev.19", spec: "my-pkg@dev" },
      info: { distTags: { latest: "6.2.1", dev: "6.2.2-dev.20" } },
      expected: "6.2.2-dev.20",
    },
    {
      name: "dev stream target equal to installed → undefined",
      installed: { version: "6.2.2-dev.19", spec: "my-pkg@dev" },
      info: { distTags: { latest: "6.2.1", dev: "6.2.2-dev.19" } },
      expected: undefined,
    },
    {
      name: "spec tag missing from distTags → undefined (no fallback to latest)",
      installed: { version: "6.2.2-dev.19", spec: "my-pkg@dev" },
      info: { distTags: { latest: "6.3.0" } },
      expected: undefined,
    },
    {
      name: "invalid installed version → undefined",
      installed: { version: "not-a-version" },
      info: { distTags: { latest: "6.3.0" } },
      expected: undefined,
    },
    {
      name: "invalid target → undefined",
      installed: { version: "6.2.1" },
      info: { distTags: { latest: "latest" } },
      expected: undefined,
    },
    {
      name: "pinned prerelease behind its release → release wins",
      installed: { version: "6.2.2-dev.19" },
      info: { distTags: { latest: "6.2.2" } },
      expected: "6.2.2",
    },
    {
      name: "installed version null → undefined",
      installed: { version: null },
      info: { distTags: { latest: "6.3.0" } },
      expected: undefined,
    },
    {
      name: "installed version undefined → undefined",
      installed: {},
      info: { distTags: { latest: "6.3.0" } },
      expected: undefined,
    },
    {
      name: "missing distTags and no latestVersion → undefined",
      installed: { version: "6.2.1" },
      info: { distTags: null },
      expected: undefined,
    },
    {
      name: "bare install, no distTags, only latestVersion → latestVersion target",
      installed: { version: "1.0.50" },
      info: { latestVersion: "1.0.52" },
      expected: "1.0.52",
    },
    {
      name: "pinned install, no distTags, only latestVersion → latestVersion target",
      installed: { version: "1.0.50", spec: "my-pkg@1.0.50" },
      info: { latestVersion: "1.0.52" },
      expected: "1.0.52",
    },
    {
      name: "latest stream: distTags.latest wins over latestVersion",
      installed: { version: "1.0.50" },
      info: { distTags: { latest: "1.0.51" }, latestVersion: "1.0.52" },
      expected: "1.0.51",
    },
    {
      name: "tagged install with no distTags (stream unknown), latestVersion present → undefined (no guessing)",
      installed: { version: "1.0.0-dev.3", spec: "my-pkg@dev" },
      info: { latestVersion: "1.0.52" },
      expected: undefined,
    },
    {
      name: "bare install, latestVersion equal to installed → undefined",
      installed: { version: "1.0.52" },
      info: { latestVersion: "1.0.52" },
      expected: undefined,
    },
    {
      name: "bare install, installed ahead of latestVersion (no downgrade) → undefined",
      installed: { version: "1.0.53" },
      info: { latestVersion: "1.0.52" },
      expected: undefined,
    },
    {
      name: "invalid latestVersion → undefined",
      installed: { version: "1.0.50" },
      info: { latestVersion: "latest" },
      expected: undefined,
    },
  ];

  for (const { name, installed, info, expected } of cases) {
    it(name, () => {
      expect(getUpdateTarget(installed, info)).toBe(expected);
    });
  }
});
