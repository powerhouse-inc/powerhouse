import { describe, expect, it } from "vitest";
import { BASE_REDUCER_VERSIONS } from "./base-reducer-protocol.js";
import {
  coversLocal,
  holdReason,
  isOlderManifest,
  PEER_CAPABILITIES,
  legacySupports,
  localPeerManifest,
  localSupports,
  mergePeerCapabilities,
  peerSupports,
  readPeerManifest,
  capSelection,
  selectProtocolVersions,
  type PeerCapability,
  type PeerCapabilityFlags,
  type ProtocolCapability,
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
  it("registers base-reducer [1, 2], signature [2], document-purge [1] and marker-refusal [1]", () => {
    expect(localSupports(PEER_CAPABILITIES, {})).toEqual({
      protocols: {
        "base-reducer": [1, 2],
        signature: [2],
        "document-purge": [1],
      },
      features: { "marker-refusal": [1] },
    });
  });

  describe("base-reducer under undoV3", () => {
    const undoV3 = { undoV3: true };

    it("supports [1, 2, 3] with the flag on and [1, 2] with it off", () => {
      expect(
        localSupports(PEER_CAPABILITIES, undoV3).protocols["base-reducer"],
      ).toEqual([1, 2, 3]);
      expect(
        localSupports(PEER_CAPABILITIES, { undoV3: false }).protocols[
          "base-reducer"
        ],
      ).toEqual([1, 2]);
    });

    it("keeps the baseline at [1, 2] for a silent peer", () => {
      expect(
        legacySupports(PEER_CAPABILITIES).protocols["base-reducer"],
      ).toEqual([1, 2]);
    });

    it("prefers 3 with the flag on and 2 otherwise, from the capability table", () => {
      const baseReducer = PEER_CAPABILITIES.find(
        (capability) => capability.name === "base-reducer",
      ) as ProtocolCapability;
      expect(baseReducer.preferred!({})).toBe(2);
      expect(baseReducer.preferred!({ undoV3: false })).toBe(2);
      expect(baseReducer.preferred!(undoV3)).toBe(3);
      for (const version of baseReducer.baseline) {
        expect(BASE_REDUCER_VERSIONS).toContain(version);
      }
    });

    // The creator chooses; a member that cannot run 3 is held from it.
    it("selects the creator's preference whatever the members support", () => {
      const select = (
        members: Supports[],
        flags: PeerCapabilityFlags = undoV3,
      ) =>
        selectProtocolVersions({
          capabilities: PEER_CAPABILITIES,
          flags,
          members,
        })["base-reducer"];
      const on = localSupports(PEER_CAPABILITIES, undoV3);
      const off = localSupports(PEER_CAPABILITIES, {});
      expect(select([])).toBe(3);
      expect(select([on])).toBe(3);
      expect(select([legacySupports(PEER_CAPABILITIES)])).toBe(3);
      expect(select([on, off])).toBe(3);
      expect(select([on], {})).toBe(2);
    });

    // R5: without a gated preference the members narrow it, as before.
    it("narrows an ungated preference by every member's support", () => {
      const select = (members: Supports[]) =>
        selectProtocolVersions({
          capabilities: PEER_CAPABILITIES,
          flags: {},
          members,
        })["base-reducer"];
      expect(select([{ protocols: {}, features: {} }])).toBe(1);
      expect(select([legacySupports(PEER_CAPABILITIES)])).toBe(2);
    });

    it("holds a base-reducer 3 document from a peer without the flag", () => {
      const on = localSupports(PEER_CAPABILITIES, undoV3);
      const off = localSupports(PEER_CAPABILITIES, {});
      expect(coversLocal(off, on, PEER_CAPABILITIES)).toBe(false);
      expect(coversLocal(on, off, PEER_CAPABILITIES)).toBe(true);
      expect(holdReason(off, { "base-reducer": 3 }, PEER_CAPABILITIES)).toEqual(
        { protocol: "base-reducer", version: 3, peerSupports: [1, 2] },
      );
      expect(
        holdReason(on, { "base-reducer": 3 }, PEER_CAPABILITIES),
      ).toBeUndefined();
    });
  });

  it("gives a silent peer no marker-refusal support", () => {
    expect(
      legacySupports(PEER_CAPABILITIES).features["marker-refusal"],
    ).toEqual([]);
  });

  it("gives a silent peer no document-purge support", () => {
    expect(
      legacySupports(PEER_CAPABILITIES).protocols["document-purge"],
    ).toEqual([]);
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
      "document-purge",
      "marker-refusal",
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

  it("changes revision with the start sequence, and orders by it", () => {
    const before = localPeerManifest(PEER_CAPABILITIES, {}, undefined, 1);
    const after = localPeerManifest(PEER_CAPABILITIES, {}, undefined, 2);

    expect(after.revision).not.toBe(before.revision);
    expect(isOlderManifest(before, after)).toBe(true);
    expect(isOlderManifest(after, before)).toBe(false);
    expect(isOlderManifest(before, null)).toBe(false);
    expect(isOlderManifest(null, after)).toBe(false);
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
      sequence: 0,
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
    const narrow = localSupports(capabilities, {});
    expect(coversLocal(narrow, narrow, capabilities)).toBe(true);
    expect(coversLocal(narrow, wide, capabilities)).toBe(false);
    expect(coversLocal(wide, wide, capabilities)).toBe(true);
  });

  it("does not let a silent peer cover a reactor that runs document-purge", () => {
    expect(
      coversLocal(silent, localSupports(capabilities, {}), capabilities),
    ).toBe(false);
  });

  describe("a purged document", () => {
    const purged = { "document-purge": 1 };

    it("is held for a silent peer", () => {
      expect(holdReason(silent, purged, capabilities)).toEqual({
        protocol: "document-purge",
        version: 1,
        peerSupports: [],
      });
    });

    it("is held for a peer whose manifest lacks document-purge", () => {
      const manifest = readPeerManifest({
        format: 1,
        protocols: { "base-reducer": [1, 2], signature: [2] },
      })!;
      expect(holdReason(manifest, purged, capabilities)).toEqual({
        protocol: "document-purge",
        version: 1,
        peerSupports: [],
      });
    });

    it("is not held for a peer that announces document-purge [1]", () => {
      const manifest = localPeerManifest(PEER_CAPABILITIES, {});
      expect(holdReason(manifest, purged, capabilities)).toBeUndefined();
    });
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

  it("never selects document-purge, even when every member runs it", () => {
    const local = localSupports(PEER_CAPABILITIES, {});
    for (const members of [[], [local], [local, local]]) {
      expect(
        selectProtocolVersions({
          capabilities: PEER_CAPABILITIES,
          flags: {},
          members,
        }),
      ).not.toHaveProperty("document-purge");
    }
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

describe("selection rules", () => {
  const select = (capability: PeerCapability, members: Supports[]) =>
    selectProtocolVersions({
      capabilities: [capability],
      flags: { testProtocol: true },
      members,
    })["test-protocol"];
  const runsOne: Supports = {
    protocols: { "test-protocol": [1] },
    features: {},
  };

  it("narrows an agreed protocol by its members, and not a creator-chosen one", () => {
    expect(select(TEST_PROTOCOL, [runsOne])).toBe(1);
    expect(select({ ...TEST_PROTOCOL, selection: "agreed" }, [runsOne])).toBe(
      1,
    );
    expect(select({ ...TEST_PROTOCOL, selection: "creator" }, [runsOne])).toBe(
      2,
    );
  });
});

describe("capSelection", () => {
  const runsAll = localSupports(PEER_CAPABILITIES, { undoV3: true });
  const cap = (selected: Record<string, number> | undefined) =>
    capSelection(selected, PEER_CAPABILITIES, runsAll);

  it("takes a negotiated version this build runs as given", () => {
    expect(cap({ "base-reducer": 3 })).toEqual({ "base-reducer": 3 });
    expect(cap({ "base-reducer": 2 })).toEqual({ "base-reducer": 2 });
    expect(cap({ "base-reducer": 1 })).toEqual({ "base-reducer": 1 });
  });

  it("drops a newer negotiated version to the highest it runs, and fills an absent one from the baseline", () => {
    expect(cap({ "base-reducer": 4 })).toEqual({ "base-reducer": 3 });
    expect(cap({})).toEqual({ "base-reducer": 2 });
    expect(cap(undefined)).toEqual({ "base-reducer": 2 });
  });

  it("refuses another known protocol at a version it does not run, and passes an unknown one", () => {
    expect(cap({ "base-reducer": 3, signature: 2 })).toEqual({
      "base-reducer": 3,
      signature: 2,
    });
    expect(() => cap({ "base-reducer": 3, signature: 3 })).toThrow(
      "Cannot create at signature 3",
    );
    expect(cap({ "base-reducer": 3, "future-protocol": 7 })).toEqual({
      "base-reducer": 3,
      "future-protocol": 7,
    });
  });

  it("refuses a negotiated version below everything it runs", () => {
    expect(() => cap({ "base-reducer": 0 })).toThrow(
      "Cannot create at base-reducer 0",
    );
  });
});
