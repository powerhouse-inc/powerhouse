import { describe, expect, it } from "vitest";
import {
  blockKey,
  compareVersions,
  isExactVersion,
  pickClosestVersion,
  rankClosestVersions,
} from "../src/block-type.js";

describe("isExactVersion", () => {
  it.each([
    "0.0.0",
    "1.2.3",
    "10.20.30",
    "6.2.3-dev.27",
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-0.3.7",
    "1.0.0-x.7.z.92",
    "1.0.0+20130313144700",
    "1.0.0-beta+exp.sha.5114f85",
    "1.0.0-x-y-z.--",
  ])("accepts %s", (version) => {
    expect(isExactVersion(version)).toBe(true);
  });

  it.each([
    "",
    "latest",
    "next",
    "1",
    "1.2",
    "v1.2.3",
    "^1.2.3",
    "~1.2.3",
    ">=1.2.3",
    "1.2.x",
    "1.2.*",
    "1.2.3 - 2.0.0",
    "1.2.3 || 2.0.0",
    "01.2.3",
    "1.02.3",
    "1.2.03",
    "1.2.3-01",
    "1.2.3-",
    "1.2.3+",
    "1.2.3-a..b",
    " 1.2.3",
  ])("rejects %j", (version) => {
    expect(isExactVersion(version)).toBe(false);
  });
});

describe("blockKey", () => {
  const block = {
    pieceName: "@activepieces/piece-http",
    kind: "action" as const,
    name: "send_request",
  };

  it("ignores the version", () => {
    const pinned = { ...block, pieceVersion: "0.11.19" };
    expect(blockKey(pinned)).toBe(blockKey(block));
  });

  it("tells actions from triggers and pieces apart", () => {
    expect(blockKey(block)).not.toBe(blockKey({ ...block, kind: "trigger" }));
    expect(blockKey(block)).not.toBe(
      blockKey({ ...block, pieceName: "@activepieces/piece-openai" }),
    );
  });
});

describe("compareVersions", () => {
  // Ascending, straight from the semver 2.0 spec plus core-number cases.
  const ORDERED = [
    "0.9.9",
    "0.10.0",
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
    "1.0.1",
    "1.2.0",
    "1.10.0",
    "2.0.0-dev.9",
    "2.0.0-dev.10",
    "2.0.0",
    "10.0.0",
  ];

  it("orders by semver precedence", () => {
    for (let i = 0; i < ORDERED.length; i++) {
      for (let j = 0; j < ORDERED.length; j++) {
        expect(compareVersions(ORDERED[i], ORDERED[j])).toBe(Math.sign(i - j));
      }
    }
  });

  it("sorts", () => {
    const shuffled = [...ORDERED].reverse();
    expect(shuffled.sort(compareVersions)).toEqual(ORDERED);
  });

  it("ignores build metadata", () => {
    expect(compareVersions("1.0.0+a", "1.0.0+b")).toBe(0);
    expect(compareVersions("1.0.0-rc.1+a", "1.0.0-rc.1")).toBe(0);
  });

  it("throws on a non-exact version", () => {
    expect(() => compareVersions("latest", "1.0.0")).toThrow(/exact semver/);
  });
});

describe("pickClosestVersion", () => {
  const available = [
    "1.0.0",
    "1.2.0",
    "1.4.1",
    "2.0.0",
    "2.1.0",
    "3.0.0-dev.2",
  ];

  it("takes the exact version", () => {
    expect(pickClosestVersion("1.2.0", available)).toEqual({
      version: "1.2.0",
      match: "exact",
    });
  });

  it("takes the highest same-major at or above the request", () => {
    expect(pickClosestVersion("1.1.0", available)).toEqual({
      version: "1.4.1",
      match: "compatible",
    });
    expect(pickClosestVersion("2.0.1", available)).toEqual({
      version: "2.1.0",
      match: "compatible",
    });
  });

  it("falls back to the highest same-major below the request", () => {
    expect(pickClosestVersion("1.5.0", available)).toEqual({
      version: "1.4.1",
      match: "fallback",
    });
  });

  it("falls back to the highest of any major", () => {
    expect(pickClosestVersion("4.0.0", available)).toEqual({
      version: "3.0.0-dev.2",
      match: "fallback",
    });
    expect(pickClosestVersion("0.5.0", ["1.0.0", "2.0.0"])).toEqual({
      version: "2.0.0",
      match: "fallback",
    });
  });

  it("treats prereleases as ordinary versions on their line", () => {
    expect(
      pickClosestVersion("6.2.3-dev.20", [
        "6.2.3-dev.19",
        "6.2.3-dev.27",
        "6.2.2",
      ]),
    ).toEqual({ version: "6.2.3-dev.27", match: "compatible" });
    expect(pickClosestVersion("3.0.0-dev.1", available)).toEqual({
      version: "3.0.0-dev.2",
      match: "compatible",
    });
    expect(pickClosestVersion("6.2.3", ["6.2.3-dev.27"])).toEqual({
      version: "6.2.3-dev.27",
      match: "fallback",
    });
  });

  it("uses major.minor as the line while the major is 0", () => {
    const zero = ["0.1.0", "0.1.5", "0.2.0", "0.2.3", "0.3.0"];
    expect(pickClosestVersion("0.2.1", zero)).toEqual({
      version: "0.2.3",
      match: "compatible",
    });
    expect(pickClosestVersion("0.1.7", zero)).toEqual({
      version: "0.1.5",
      match: "fallback",
    });
    expect(pickClosestVersion("0.4.0", zero)).toEqual({
      version: "0.3.0",
      match: "fallback",
    });
  });

  it("treats a build-metadata twin as compatible, not exact", () => {
    expect(pickClosestVersion("1.0.0+a", ["1.0.0+b"])).toEqual({
      version: "1.0.0+b",
      match: "compatible",
    });
  });

  it("skips invalid candidates and gives nothing for an empty list", () => {
    expect(pickClosestVersion("1.0.0", [])).toBeUndefined();
    expect(pickClosestVersion("1.0.0", ["latest", "next"])).toBeUndefined();
    expect(pickClosestVersion("1.0.0", ["latest", "1.1.0"])).toEqual({
      version: "1.1.0",
      match: "compatible",
    });
  });

  it("does not depend on the order of the list", () => {
    const reversed = [...available].reverse();
    expect(pickClosestVersion("1.1.0", reversed)).toEqual({
      version: "1.4.1",
      match: "compatible",
    });
  });

  it("falls back to the highest when the request itself is not exact", () => {
    expect(pickClosestVersion("latest", available)).toEqual({
      version: "3.0.0-dev.2",
      match: "fallback",
    });
  });
});

describe("rankClosestVersions", () => {
  it("orders every candidate the way pickClosestVersion prefers them", () => {
    const versions = ["0.0.1", "0.0.3", "0.1.0", "0.2.0", "0.0.3"];
    expect(rankClosestVersions("0.0.2", versions)).toEqual([
      { version: "0.0.3", match: "compatible" },
      { version: "0.0.1", match: "fallback" },
      { version: "0.2.0", match: "fallback" },
      { version: "0.1.0", match: "fallback" },
    ]);
    expect(rankClosestVersions("0.1.0", versions)[0]).toEqual({
      version: "0.1.0",
      match: "exact",
    });
  });
});
