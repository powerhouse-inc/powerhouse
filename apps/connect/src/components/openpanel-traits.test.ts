import { describe, expect, it } from "vitest";

import type { User } from "@renown/sdk";

import { buildIdentifyPayload, buildTraits } from "./openpanel-traits.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal valid renown User shape. */
function makeUser(overrides: Partial<User> = {}): User {
  return {
    did: "did:pkh:eip155:1:0xabc",
    address: "0xabc123" as `0x${string}`,
    networkId: "eip155",
    chainId: 1,
    credential: undefined,
    ...overrides,
  } as User;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildTraits", () => {
  // ------------------------------------------------------------------
  // Always-present fields (address, networkId, chainId)
  // ------------------------------------------------------------------

  it("includes all always-present fields", () => {
    const user = makeUser();
    const traits = buildTraits(user);

    expect(traits.address).toBe("0xabc123");
    expect(traits.did).toBe("did:pkh:eip155:1:0xabc");
    expect(traits.networkId).toBe("eip155");
    expect(traits.chainId).toBe(1);
    expect(traits.caip2).toBe("eip155:1");
  });

  // ------------------------------------------------------------------
  // Credential is NEVER forwarded
  // ------------------------------------------------------------------

  it("never includes credential even when set", () => {
    const user = makeUser({
      credential: { proof: "jwt" } as unknown as User["credential"],
    });
    const traits = buildTraits(user);

    expect("credential" in traits).toBe(false);
  });

  // ------------------------------------------------------------------
  // did travels as a trait; profileId must not leak into traits
  // ------------------------------------------------------------------

  it("includes did as a trait but never profileId", () => {
    const user = makeUser();
    const traits = buildTraits(user);

    expect(traits.did).toBe("did:pkh:eip155:1:0xabc");
    expect("profileId" in traits).toBe(false);
  });

  // ------------------------------------------------------------------
  // ens fields
  // ------------------------------------------------------------------

  it("includes ensName and ensAvatar when both are present", () => {
    const user = makeUser({
      ens: { name: "alice.eth", avatarUrl: "https://example.com/avatar.png" },
    });
    const traits = buildTraits(user);

    expect(traits.ensName).toBe("alice.eth");
    expect(traits.ensAvatar).toBe("https://example.com/avatar.png");
  });

  it("omits ens fields when ens is absent", () => {
    const user = makeUser({ ens: undefined });
    const traits = buildTraits(user);

    expect("ensName" in traits).toBe(false);
    expect("ensAvatar" in traits).toBe(false);
  });

  it("omits ens fields when ens object is present but name/avatarUrl are absent", () => {
    const user = makeUser({ ens: {} });
    const traits = buildTraits(user);

    expect("ensName" in traits).toBe(false);
    expect("ensAvatar" in traits).toBe(false);
  });

  it("includes only ensName when avatarUrl is absent", () => {
    const user = makeUser({ ens: { name: "bob.eth" } });
    const traits = buildTraits(user);

    expect(traits.ensName).toBe("bob.eth");
    expect("ensAvatar" in traits).toBe(false);
  });

  // ------------------------------------------------------------------
  // profile fields
  // ------------------------------------------------------------------

  it("includes all profile fields when profile is fully populated", () => {
    const user = makeUser({
      profile: {
        documentId: "doc-123",
        username: "alice",
        userImage: "https://example.com/img.png",
        createdAt: "2024-01-01T00:00:00Z",
        ethAddress: "0xabc",
        updatedAt: "2024-01-02T00:00:00Z",
      },
    });
    const traits = buildTraits(user);

    expect(traits.username).toBe("alice");
    expect(traits.userImage).toBe("https://example.com/img.png");
    expect(traits.profileDocumentId).toBe("doc-123");
    expect(traits.profileCreatedAt).toBe("2024-01-01T00:00:00Z");
  });

  it("omits all profile fields when profile is absent", () => {
    const user = makeUser({ profile: undefined });
    const traits = buildTraits(user);

    expect("username" in traits).toBe(false);
    expect("userImage" in traits).toBe(false);
    expect("profileDocumentId" in traits).toBe(false);
    expect("profileCreatedAt" in traits).toBe(false);
  });

  it("omits profile fields that are null (RenownProfile allows null)", () => {
    const user = makeUser({
      profile: {
        documentId: "doc-456",
        username: null,
        userImage: null,
        createdAt: "2024-01-01T00:00:00Z",
        ethAddress: null,
        updatedAt: "2024-01-02T00:00:00Z",
      },
    });
    const traits = buildTraits(user);

    // null fields are omitted
    expect("username" in traits).toBe(false);
    expect("userImage" in traits).toBe(false);
    // non-null fields are still present
    expect(traits.profileDocumentId).toBe("doc-456");
    expect(traits.profileCreatedAt).toBe("2024-01-01T00:00:00Z");
  });

  // ------------------------------------------------------------------
  // Full traits payload (matches the brief's Identity Traits table)
  // ------------------------------------------------------------------

  it("produces the full expected trait shape for a complete user", () => {
    const user = makeUser({
      ens: { name: "fulluser.eth", avatarUrl: "https://ens.io/avatar" },
      profile: {
        documentId: "doc-full",
        username: "fulluser",
        userImage: "https://example.com/u.png",
        createdAt: "2025-01-01T00:00:00Z",
        ethAddress: "0xfull",
        updatedAt: "2025-01-02T00:00:00Z",
      },
    });

    const traits = buildTraits(user);

    expect(traits).toEqual({
      address: "0xabc123",
      did: "did:pkh:eip155:1:0xabc",
      networkId: "eip155",
      chainId: 1,
      caip2: "eip155:1",
      ensName: "fulluser.eth",
      ensAvatar: "https://ens.io/avatar",
      username: "fulluser",
      userImage: "https://example.com/u.png",
      profileDocumentId: "doc-full",
      profileCreatedAt: "2025-01-01T00:00:00Z",
    });

    // Confirm banned fields are absent
    expect("credential" in traits).toBe(false);
    expect("profileId" in traits).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildIdentifyPayload
// ---------------------------------------------------------------------------

function makeProfile(
  overrides: Partial<NonNullable<User["profile"]>> = {},
): NonNullable<User["profile"]> {
  return {
    documentId: "doc-1",
    username: null,
    userImage: null,
    createdAt: "2025-01-01T00:00:00Z",
    ethAddress: null,
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildIdentifyPayload", () => {
  it("uses the wallet address as profileId and traits as properties", () => {
    const user = makeUser();
    const payload = buildIdentifyPayload(user);

    expect(payload.profileId).toBe("0xabc123");
    expect(payload.properties).toEqual(buildTraits(user));
  });

  it("omits avatar and firstName when there is no ens or profile data", () => {
    const payload = buildIdentifyPayload(makeUser());

    expect("avatar" in payload).toBe(false);
    expect("firstName" in payload).toBe(false);
  });

  it("resolves avatar as userImage ?? ensAvatar", () => {
    const both = buildIdentifyPayload(
      makeUser({
        ens: { avatarUrl: "https://ens.io/a.png" },
        profile: makeProfile({ userImage: "https://example.com/u.png" }),
      }),
    );
    expect(both.avatar).toBe("https://example.com/u.png");

    const ensOnly = buildIdentifyPayload(
      makeUser({ ens: { avatarUrl: "https://ens.io/a.png" } }),
    );
    expect(ensOnly.avatar).toBe("https://ens.io/a.png");
  });

  it("resolves firstName as ensName ?? username", () => {
    const both = buildIdentifyPayload(
      makeUser({
        ens: { name: "alice.eth" },
        profile: makeProfile({ username: "alice" }),
      }),
    );
    expect(both.firstName).toBe("alice.eth");

    const usernameOnly = buildIdentifyPayload(
      makeUser({ profile: makeProfile({ username: "alice" }) }),
    );
    expect(usernameOnly.firstName).toBe("alice");
  });
});
