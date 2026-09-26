import { sha256 } from "@noble/hashes/sha2.js";
import { canonicalJson } from "./action-signature.js";
import { bytesToBase64Url } from "./crypto.js";

/** The reactor feature flags a capability's support is a function of. */
export type PeerCapabilityFlags = {
  readonly [flag: string]: boolean | undefined;
};

/** A document protocol, named by its `protocolVersions` key. */
export type ProtocolCapability = {
  kind: "protocol";
  name: string;
  /** What a peer that announces nothing is assumed to support. */
  baseline: readonly number[];
  supported(flags: PeerCapabilityFlags): readonly number[];
  /** The version new documents take when peers agree. Absent: not negotiated. */
  preferred?(flags: PeerCapabilityFlags): number;
  /** A header may omit the key. */
  optional: boolean;
};

/** A feature that changes what a peer sends or expects on the wire. */
export type FeatureCapability = {
  kind: "feature";
  name: string;
  baseline: readonly number[];
  supported(flags: PeerCapabilityFlags): readonly number[];
};

export type PeerCapability = ProtocolCapability | FeatureCapability;

// Baselines are frozen at what the last release without peer agreement runs.
export const PEER_CAPABILITIES: readonly PeerCapability[] = [
  {
    kind: "protocol",
    name: "base-reducer",
    baseline: [1, 2],
    supported: () => [1, 2],
    preferred: () => 2,
    optional: false,
  },
  {
    kind: "protocol",
    name: "signature",
    baseline: [2],
    supported: () => [2],
    optional: true,
  },
];

/** `base` plus `extra`; an extra replaces a base entry of the same name. */
export function mergePeerCapabilities(
  base: readonly PeerCapability[],
  extra: readonly PeerCapability[],
): PeerCapability[] {
  const key = (capability: PeerCapability) =>
    `${capability.kind}:${capability.name}`;
  const replaced = new Set(extra.map(key));
  return [
    ...base.filter((capability) => !replaced.has(key(capability))),
    ...extra,
  ];
}

export const PEER_MANIFEST_FORMAT = 1;

export type Supports = {
  protocols: { [protocol: string]: readonly number[] };
  features: { [feature: string]: readonly number[] };
};

export type PeerManifest = Supports & {
  format: 1;
  /** The signer's did:key, when configured; informational. */
  appKey?: string;
  /** base64url(sha256(canonicalJson(Supports))) */
  revision: string;
};

function versionSet(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function supportsFrom(
  capabilities: readonly PeerCapability[],
  values: (capability: PeerCapability) => readonly number[],
): Supports {
  const supports: Supports = { protocols: {}, features: {} };
  for (const capability of capabilities) {
    const target =
      capability.kind === "protocol" ? supports.protocols : supports.features;
    target[capability.name] = versionSet(values(capability));
  }
  return supports;
}

/** What this reactor supports, for every capability it registers. */
export function localSupports(
  capabilities: readonly PeerCapability[],
  flags: PeerCapabilityFlags,
): Supports {
  return supportsFrom(capabilities, (capability) =>
    capability.supported(flags),
  );
}

/** What a peer that announces nothing supports. */
export function legacySupports(
  capabilities: readonly PeerCapability[],
): Supports {
  return supportsFrom(capabilities, (capability) => capability.baseline);
}

export function manifestRevision(supports: Supports): string {
  const preimage = canonicalJson(
    { protocols: supports.protocols, features: supports.features },
    "peer manifest",
  );
  return bytesToBase64Url(sha256(new TextEncoder().encode(preimage)));
}

export function localPeerManifest(
  capabilities: readonly PeerCapability[],
  flags: PeerCapabilityFlags,
  appKey?: string,
): PeerManifest {
  const supports = localSupports(capabilities, flags);
  return {
    format: PEER_MANIFEST_FORMAT,
    ...(appKey !== undefined ? { appKey } : {}),
    revision: manifestRevision(supports),
    protocols: supports.protocols,
    features: supports.features,
  };
}

/** A peer's manifest, or the baselines for a peer that announced none. */
export function peerSupports(
  manifest: PeerManifest | null,
  capabilities: readonly PeerCapability[],
): Supports {
  return manifest ?? legacySupports(capabilities);
}

function readVersionMap(
  value: unknown,
): { [name: string]: readonly number[] } | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const map: { [name: string]: readonly number[] } = {};
  for (const [name, versions] of Object.entries(value)) {
    if (
      !Array.isArray(versions) ||
      !versions.every((v) => Number.isInteger(v))
    ) {
      return undefined;
    }
    map[name] = versionSet(versions as number[]);
  }
  return map;
}

/**
 * A manifest as received from a peer, or null when it is not one. Formats only
 * add fields, so one of an unknown format is read as its two maps.
 */
export function readPeerManifest(value: unknown): PeerManifest | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const protocols = readVersionMap(raw.protocols);
  const features = readVersionMap(raw.features ?? {});
  if (!protocols || !features) {
    return null;
  }
  return {
    format: PEER_MANIFEST_FORMAT,
    ...(typeof raw.appKey === "string" ? { appKey: raw.appKey } : {}),
    revision:
      typeof raw.revision === "string"
        ? raw.revision
        : manifestRevision({ protocols, features }),
    protocols,
    features,
  };
}

/** Why a document may not go to a peer. */
export type HoldReason = {
  protocol: string;
  version: number;
  peerSupports: readonly number[];
};

/** Only keys this reactor registers are judged; an absent key agrees. */
export function holdReason(
  peer: Supports,
  versions: { readonly [protocol: string]: number },
  capabilities: readonly PeerCapability[],
): HoldReason | undefined {
  for (const capability of capabilities) {
    if (capability.kind !== "protocol") continue;
    const version = versions[capability.name] as number | undefined;
    if (version === undefined) continue;
    const supported = peer.protocols[capability.name] ?? [];
    if (!supported.includes(version)) {
      return { protocol: capability.name, version, peerSupports: supported };
    }
  }
  return undefined;
}

/** Whether a peer runs every version this reactor does, so nothing is held. */
export function coversLocal(
  peer: Supports,
  local: Supports,
  capabilities: readonly PeerCapability[],
): boolean {
  for (const capability of capabilities) {
    if (capability.kind !== "protocol") continue;
    const theirs = peer.protocols[capability.name] ?? [];
    const ours = local.protocols[capability.name] ?? [];
    if (!ours.every((version) => theirs.includes(version))) {
      return false;
    }
  }
  return true;
}

/**
 * protocolVersions for a new document: per negotiated protocol, the highest
 * version up to the local preference that every member supports, else the
 * lowest local one. `requested` wins over what is selected.
 */
export function selectProtocolVersions(input: {
  capabilities: readonly PeerCapability[];
  flags: PeerCapabilityFlags;
  members: Iterable<Supports>;
  requested?: { readonly [protocol: string]: number };
}): { [protocol: string]: number } {
  const members = [...input.members];
  const selected: { [protocol: string]: number } = {};
  for (const capability of input.capabilities) {
    if (capability.kind !== "protocol" || !capability.preferred) continue;
    const preferred = capability.preferred(input.flags);
    const supported = capability.supported(input.flags);
    let agreed = supported.filter((version) => version <= preferred);
    for (const member of members) {
      const theirs = member.protocols[capability.name] ?? [];
      agreed = agreed.filter((version) => theirs.includes(version));
    }
    selected[capability.name] =
      agreed.length > 0 ? Math.max(...agreed) : Math.min(...supported);
  }
  return { ...selected, ...input.requested };
}
