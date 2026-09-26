import { describe, expect, it } from "vitest";
import {
  coversLocal,
  holdReason,
  PEER_CAPABILITIES,
  legacySupports,
  localPeerManifest,
  localSupports,
  mergePeerCapabilities,
  peerSupports,
  readPeerManifest,
  selectProtocolVersions,
  type PeerCapability,
  type Supports,
} from "./peer-agreement.js";

const TEST_PROTOCOL: PeerCapability = {
  kind: "protocol",
  name: "test-protocol",
  baseline: [1],
  supported: (flags) => (flags.testProtocol ? [1, 2] : [1]),
  preferred: (flags) => (flags.testProtocol ? 2 : 1),
  optional: true,
};

describe("peer capabilities", () => {
  it("registers base-reducer [1, 2] and signature [2]", () => {
    expect(localSupports(PEER_CAPABILITIES, {})).toEqual({
      protocols: { "base-reducer": [1, 2], signature: [2] },
      features: {},
    });
  });

  it("gives a silent peer the baselines", () => {
    expect(peerSupports(null, PEER_CAPABILITIES)).toEqual(
      legacySupports(PEER_CAPABILITIES),
    );
    expect(legacySupports([TEST_PROTOCOL]).protocols["test-protocol"]).toEqual([
      1,
    ]);
  });

  it("replaces a base capability with an extra of the same name", () => {
    const merged = mergePeerCapabilities(PEER_CAPABILITIES, [
      { ...TEST_PROTOCOL, name: "base-reducer" },
      TEST_PROTOCOL,
    ]);
    expect(merged.map((capability) => capability.name)).toEqual([
      "signature",
      "base-reducer",
      "test-protocol",
    ]);
  });
});

describe("localPeerManifest", () => {
  it("has a revision that depends only on what is supported", () => {
    const first = localPeerManifest(PEER_CAPABILITIES, {}, "did:key:a");
    const second = localPeerManifest([...PEER_CAPABILITIES].reverse(), {});

    expect(first.format).toBe(1);
    expect(first.appKey).toBe("did:key:a");
    expect(second.appKey).toBeUndefined();
    expect(second.revision).toBe(first.revision);
    expect(first.revision).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("changes revision when a flag widens support", () => {
    const capabilities = mergePeerCapabilities(PEER_CAPABILITIES, [
      TEST_PROTOCOL,
    ]);
    const narrow = localPeerManifest(capabilities, {});
    const wide = localPeerManifest(capabilities, { testProtocol: true });

    expect(wide.protocols["test-protocol"]).toEqual([1, 2]);
    expect(wide.revision).not.toBe(narrow.revision);
  });
});

describe("readPeerManifest", () => {
  it("round-trips a local manifest", () => {
    const manifest = localPeerManifest(PEER_CAPABILITIES, {}, "did:key:a");
    expect(readPeerManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(
      manifest,
    );
  });

  it("reads a manifest of an unknown format as its maps", () => {
    const read = readPeerManifest({
      format: 2,
      revision: "r2",
      protocols: { "base-reducer": [3, 1, 2] },
      features: { "sync.anti-entropy": [1] },
      somethingNew: { nested: true },
    });
    expect(read).toEqual({
      format: 1,
      revision: "r2",
      protocols: { "base-reducer": [1, 2, 3] },
      features: { "sync.anti-entropy": [1] },
    });
  });

  it("rejects what is not a manifest", () => {
    expect(readPeerManifest(null)).toBeNull();
    expect(readPeerManifest("manifest")).toBeNull();
    expect(readPeerManifest({ protocols: { x: ["1"] } })).toBeNull();
    expect(readPeerManifest({ features: {} })).toBeNull();
  });
});

describe("holdReason", () => {
  const capabilities = mergePeerCapabilities(PEER_CAPABILITIES, [
    TEST_PROTOCOL,
  ]);
  const silent = legacySupports(capabilities);
  const wide = localSupports(capabilities, { testProtocol: true });

  it.each([
    ["no versions", {}, undefined],
    ["baseline versions", { "base-reducer": 2, signature: 2 }, undefined],
    ["an absent optional key", { "base-reducer": 1 }, undefined],
    ["an unregistered key", { "base-reducer": 2, "app-key": 9 }, undefined],
    [
      "a version outside the baseline",
      { "base-reducer": 2, "test-protocol": 2 },
      { protocol: "test-protocol", version: 2, peerSupports: [1] },
    ],
    [
      "a registered key the peer does not list",
      { "base-reducer": 3 },
      { protocol: "base-reducer", version: 3, peerSupports: [1, 2] },
    ],
  ])("against a silent peer, %s", (_label, versions, expected) => {
    expect(holdReason(silent, versions, capabilities)).toEqual(expected);
  });

  it("holds nothing from a peer that supports the version", () => {
    expect(
      holdReason(wide, { "test-protocol": 2 }, capabilities),
    ).toBeUndefined();
  });

  it("treats a capability missing from a manifest as supporting nothing", () => {
    const manifest = readPeerManifest({
      format: 2,
      protocols: { "base-reducer": [1, 2] },
    })!;
    expect(holdReason(manifest, { "test-protocol": 1 }, capabilities)).toEqual({
      protocol: "test-protocol",
      version: 1,
      peerSupports: [],
    });
  });

  it("knows when a peer covers everything local", () => {
    expect(
      coversLocal(silent, localSupports(capabilities, {}), capabilities),
    ).toBe(true);
    expect(coversLocal(silent, wide, capabilities)).toBe(false);
    expect(coversLocal(wide, wide, capabilities)).toBe(true);
  });
});

describe("selectProtocolVersions", () => {
  const capabilities = mergePeerCapabilities(PEER_CAPABILITIES, [
    TEST_PROTOCOL,
  ]);
  const wideFlags = { testProtocol: true };
  const narrow = localSupports(capabilities, {});
  const wide = localSupports(capabilities, wideFlags);
  const select = (
    members: Supports[],
    flags: Record<string, boolean> = wideFlags,
    requested?: Record<string, number>,
  ) => selectProtocolVersions({ capabilities, flags, members, requested });

  it("selects base-reducer 2 alone under the default registry", () => {
    expect(
      selectProtocolVersions({
        capabilities: PEER_CAPABILITIES,
        flags: {},
        members: [legacySupports(PEER_CAPABILITIES)],
      }),
    ).toEqual({ "base-reducer": 2 });
  });

  it.each([
    ["no members: the local preference", [], 2],
    ["every member wide", () => [wide, wide], 2],
    ["one member at [1]", () => [wide, narrow], 1],
    ["a silent member", () => [legacySupports(capabilities)], 1],
  ] as const)("with %s", (_label, members, expected) => {
    const list = typeof members === "function" ? members() : [...members];
    expect(select(list)["test-protocol"]).toBe(expected);
  });

  it("falls back to the lowest local version when nothing is agreed", () => {
    const none = { protocols: { "test-protocol": [7] }, features: {} };
    expect(select([none])["test-protocol"]).toBe(1);
  });

  it("does not negotiate a capability without a preference", () => {
    expect(select([])).not.toHaveProperty("signature");
  });

  it("stays at the local preference when members support more", () => {
    expect(select([wide], {})["test-protocol"]).toBe(1);
  });

  it("lets the caller's versions win", () => {
    expect(select([narrow], wideFlags, { "test-protocol": 2 })).toEqual({
      "base-reducer": 2,
      "test-protocol": 2,
    });
  });

  it("reads a format-2 manifest member by its maps", () => {
    const member = readPeerManifest({
      format: 2,
      protocols: { "base-reducer": [1, 2], "test-protocol": [1, 2] },
      extra: true,
    })!;
    expect(select([member])["test-protocol"]).toBe(2);
  });
});
