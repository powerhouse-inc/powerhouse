import type {
  PeerManifest,
  Supports,
} from "@powerhousedao/shared/document-model";
import type { RemoteMeta } from "./interfaces.js";

export interface IPeerAgreement {
  local(): PeerManifest;
  /** Cloneable, so agreement can be rebuilt across a worker boundary. */
  basis(): PeerAgreementBasis;
  /** What `remoteName`'s peer supports, from its manifest or the baselines. */
  peer(remoteName: string): Supports;
  /** The direct peers of the remotes in `collectionIds`, by remote name. */
  members(collectionIds: readonly string[]): Map<string, Supports>;
  /** The remotes in a collection whose peers lack the version creation wants. */
  limitedBy(collectionId: string, protocol: string): string[];
}

export type PeerAgreementBasis = {
  local: PeerManifest;
  /** What a silent peer supports. */
  legacy: Supports;
  /** The version per protocol that new documents would take locally. */
  wanted: { [protocol: string]: number };
};

/** Pure over the remote records it is given, live or not. */
export function createPeerAgreement(
  basis: PeerAgreementBasis,
  remotes: readonly Pick<RemoteMeta, "name" | "collectionId" | "peer">[],
): IPeerAgreement {
  const supportsOf = (remote: Pick<RemoteMeta, "peer">): Supports =>
    remote.peer?.manifest ?? basis.legacy;

  const members = (collectionIds: readonly string[]) => {
    const wanted = new Set(collectionIds);
    const found = new Map<string, Supports>();
    for (const remote of remotes) {
      if (wanted.has(remote.collectionId.key)) {
        found.set(remote.name, supportsOf(remote));
      }
    }
    return found;
  };

  return {
    local: () => basis.local,
    basis: () => basis,
    peer: (remoteName) => {
      const remote = remotes.find((candidate) => candidate.name === remoteName);
      return remote ? supportsOf(remote) : basis.legacy;
    },
    members,
    limitedBy: (collectionId, protocol) => {
      const version = basis.wanted[protocol] as number | undefined;
      if (version === undefined) return [];
      return [...members([collectionId])]
        .filter(
          ([, supports]) => !supports.protocols[protocol]?.includes(version),
        )
        .map(([name]) => name);
    },
  };
}
