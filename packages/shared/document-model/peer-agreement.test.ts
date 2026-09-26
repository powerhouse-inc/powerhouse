import { describe, expect, it } from "vitest";
import {
  PEER_CAPABILITIES,
  legacySupports,
  localPeerManifest,
  localSupports,
  mergePeerCapabilities,
  peerSupports,
  readPeerManifest,
  type PeerCapability,
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
