import type {
  ActionSigner,
  ISigner,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { admissionTrustPolicy } from "../../src/signer/trust-policy.js";
import type { SignatureTrustPolicy } from "../../src/signer/types.js";

const OWN_KEY = "did:key:zDnaeOwnKey";
const OTHER_KEY = "did:key:zDnaeOtherKey";
const OLD_USER = {
  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  networkId: "eip155",
  chainId: 1,
};
const NEW_USER = {
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  networkId: "eip155",
  chainId: 1,
};
const OTHER_USER = {
  address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  networkId: "eip155",
  chainId: 1,
};

function ownSigner(user?: ActionSigner["user"]): ISigner {
  return { user, app: { name: "switchboard", key: OWN_KEY } } as ISigner;
}

function claim(user: ActionSigner["user"], key: string): ActionSigner {
  return { user, app: { name: "connect", key }, signatures: [] };
}

/** Accepts OTHER_USER with OTHER_KEY; caches per (address, key). */
function cachingHostPolicy() {
  const lookup = vi.fn((signer: ActionSigner, key: string) =>
    Promise.resolve(
      signer.user.address === OTHER_USER.address && key === OTHER_KEY,
    ),
  );
  const cache = new Map<string, boolean>();
  const policy: SignatureTrustPolicy = {
    async authorizeSigner(signer, key) {
      const entry = `${signer.user.address.toLowerCase()}|${key}`;
      const cached = cache.get(entry);
      if (cached !== undefined) return cached;
      const verdict = await lookup(signer, key);
      cache.set(entry, verdict);
      return verdict;
    },
  };
  return { policy, lookup };
}

describe("admissionTrustPolicy", () => {
  it("honours an identity change after construction", async () => {
    const own = ownSigner();
    const trust = admissionTrustPolicy(own, true);

    await expect(
      trust.authorizeSigner(claim(NEW_USER, OWN_KEY), OWN_KEY, "doc"),
    ).resolves.toBe(false);

    own.user = NEW_USER;

    await expect(
      trust.authorizeSigner(claim(NEW_USER, OWN_KEY), OWN_KEY, "doc"),
    ).resolves.toBe(true);
  });

  it("accepts the own key with the new user under authEnforcement", async () => {
    const own = ownSigner(OLD_USER);
    const trust = admissionTrustPolicy(own, true);

    own.user = NEW_USER;

    await expect(
      trust.authorizeSigner(claim(NEW_USER, OWN_KEY), OWN_KEY, "doc"),
    ).resolves.toBe(true);
  });

  it("refuses the own key claiming the old user after a change", async () => {
    const own = ownSigner(OLD_USER);
    const { policy } = cachingHostPolicy();
    const trust = admissionTrustPolicy(own, true, policy);

    await expect(
      trust.authorizeSigner(claim(OLD_USER, OWN_KEY), OWN_KEY, "doc"),
    ).resolves.toBe(true);

    own.user = NEW_USER;

    await expect(
      trust.authorizeSigner(claim(OLD_USER, OWN_KEY), OWN_KEY, "doc"),
    ).resolves.toBe(false);
  });

  it("keeps other users' cached verdicts across an identity change", async () => {
    const own = ownSigner(OLD_USER);
    const { policy, lookup } = cachingHostPolicy();
    const trust = admissionTrustPolicy(own, true, policy);
    const other = claim(OTHER_USER, OTHER_KEY);

    await expect(
      trust.authorizeSigner(other, OTHER_KEY, "doc-1"),
    ).resolves.toBe(true);

    own.user = NEW_USER;

    await expect(
      trust.authorizeSigner(other, OTHER_KEY, "doc-2"),
    ).resolves.toBe(true);
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
