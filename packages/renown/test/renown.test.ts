import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Renown, RenownMemoryStorage } from "../src/common.js";
import { MemoryKeyStorage, RenownCryptoBuilder } from "../src/crypto/index.js";
import { MemoryEventEmitter } from "../src/event/memory.js";
import { fetchRenownProfile } from "../src/profile.js";
import type {
  LoginStatus,
  PowerhouseVerifiableCredential,
  RenownProfile,
  User,
} from "../src/types.js";

const TEST_BASE_URL = "https://test.renown.id";
const TEST_ADDRESS = "0x9aDdcBbaA28F7eB5f75E023F7C1Fcb13C9DFD8F7" as const;
const TEST_USER_DID = `did:pkh:eip155:1:${TEST_ADDRESS}`;

function createMockCredential(
  userDid: string,
  appDid: string,
): PowerhouseVerifiableCredential {
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: "test-credential-id",
    type: ["VerifiableCredential"],
    issuer: {
      id: userDid,
      ethereumAddress: TEST_ADDRESS,
    },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: appDid,
      app: "test-app",
    },
    credentialSchema: {
      id: "https://schema.org",
      type: "JsonSchemaValidator2018",
    },
    proof: {
      verificationMethod: "test",
      ethereumAddress: TEST_ADDRESS,
      created: new Date().toISOString(),
      proofPurpose: "assertionMethod",
      type: "EthereumEip712Signature2021",
      proofValue: "0xtest",
      eip712: {
        domain: {
          name: "Renown",
          version: "1",
          chainId: 1,
          verifyingContract: "0x0000000000000000000000000000000000000000",
        },
        types: {} as PowerhouseVerifiableCredential["proof"]["eip712"]["types"],
        primaryType: "VerifiableCredential",
      },
    },
  };
}

const MOCK_PROFILE: RenownProfile = {
  documentId: "doc-123",
  username: "testuser",
  ethAddress: TEST_ADDRESS,
  userImage: "https://example.com/avatar.png",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

describe("Renown login flow", () => {
  let renown: Renown;
  let appDid: string;

  beforeEach(async () => {
    const keyStorage = new MemoryKeyStorage();
    const crypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(keyStorage)
      .build();
    appDid = crypto.did;

    renown = new Renown(
      new RenownMemoryStorage(),
      new MemoryEventEmitter(),
      crypto,
      "test-app",
      TEST_BASE_URL,
      fetchRenownProfile,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(options: {
    credential?: PowerhouseVerifiableCredential | null;
    profile?: RenownProfile | null;
    credentialStatus?: number;
    profileStatus?: number;
  }) {
    const {
      credential,
      profile = MOCK_PROFILE,
      credentialStatus = 200,
      profileStatus = 200,
    } = options;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof URL ? input.toString() : String(input);

      if (url.includes("/api/auth/credential")) {
        if (credentialStatus !== 200 || credential === null) {
          return new Response(null, { status: credentialStatus || 404 });
        }
        return Response.json({ credential });
      }

      if (url.includes("/api/profile")) {
        if (profileStatus !== 200 || profile === null) {
          return new Response(null, { status: profileStatus || 404 });
        }
        return Response.json({ profile });
      }

      return new Response(null, { status: 404 });
    });
  }

  describe("successful login", () => {
    it("should authenticate user and transition through status states", async () => {
      const credential = createMockCredential(TEST_USER_DID, appDid);
      mockFetch({ credential });

      const statuses: LoginStatus[] = [];
      renown.on("status", (status) => statuses.push(status));

      expect(renown.status).toBe("initial");

      const user = await renown.login(TEST_USER_DID);

      expect(user.did).toBe(TEST_USER_DID);
      expect(user.address).toBe(TEST_ADDRESS);
      expect(user.networkId).toBe("eip155");
      expect(user.chainId).toBe(1);
      expect(user.credential).toStrictEqual(credential);
      expect(renown.status).toBe("authorized");
      expect(statuses).toEqual(["checking", "authorized"]);
    });

    it("should emit user event on login", async () => {
      const credential = createMockCredential(TEST_USER_DID, appDid);
      mockFetch({ credential });

      const users: (User | undefined)[] = [];
      renown.on("user", (user) => users.push(user));

      await renown.login(TEST_USER_DID);

      expect(users).toHaveLength(1);
      expect(users[0]?.did).toBe(TEST_USER_DID);
    });

    it("should persist user in storage", async () => {
      const credential = createMockCredential(TEST_USER_DID, appDid);
      mockFetch({ credential });

      await renown.login(TEST_USER_DID);

      expect(renown.user).toBeDefined();
      expect(renown.user?.did).toBe(TEST_USER_DID);
    });

    it("should call credential API with correct parameters", async () => {
      const credential = createMockCredential(TEST_USER_DID, appDid);
      mockFetch({ credential });

      await renown.login(TEST_USER_DID);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          href: expect.stringContaining("/api/auth/credential"),
        }),
        expect.objectContaining({ method: "GET" }),
      );

      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
      const url = fetchCall[0] as URL;
      const params = new URL(url.toString()).searchParams;
      expect(params.get("address")).toBe(TEST_ADDRESS);
      expect(params.get("chainId")).toBe("1");
      expect(params.get("connectId")).toBe(appDid);
    });
  });

  describe("profile fetching", () => {
    it("should enrich user with profile data in the background", async () => {
      const credential = createMockCredential(TEST_USER_DID, appDid);
      mockFetch({ credential });

      await renown.login(TEST_USER_DID);

      // Wait for background profile fetch
      await vi.waitFor(() => {
        expect(renown.user?.profile).toBeDefined();
      });

      expect(renown.user?.profile?.documentId).toBe("doc-123");
      expect(renown.user?.profile?.username).toBe("testuser");
      expect(renown.user?.ens?.name).toBe("testuser");
      expect(renown.user?.ens?.avatarUrl).toBe(
        "https://example.com/avatar.png",
      );
    });

    it("should emit a second user event after profile fetch", async () => {
      const credential = createMockCredential(TEST_USER_DID, appDid);
      mockFetch({ credential });

      const users: (User | undefined)[] = [];
      renown.on("user", (user) => users.push(user));

      await renown.login(TEST_USER_DID);

      await vi.waitFor(() => {
        expect(users).toHaveLength(2);
      });

      // First emission: user without profile
      expect(users[0]?.profile).toBeUndefined();
      // Second emission: user with profile
      expect(users[1]?.profile?.documentId).toBe("doc-123");
    });

    it("should call profile API with correct parameters", async () => {
      const credential = createMockCredential(TEST_USER_DID, appDid);
      mockFetch({ credential });

      await renown.login(TEST_USER_DID);

      await vi.waitFor(() => {
        expect(renown.user?.profile).toBeDefined();
      });

      const profileCall = vi
        .mocked(globalThis.fetch)
        .mock.calls.find((call) => String(call[0]).includes("/api/profile"));
      expect(profileCall).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const body = JSON.parse((profileCall![1] as RequestInit).body as string);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.ethAddress).toBe(TEST_ADDRESS);
    });

    it("should handle profile fetch failure gracefully", async () => {
      const credential = createMockCredential(TEST_USER_DID, appDid);
      mockFetch({ credential, profileStatus: 500 });

      const user = await renown.login(TEST_USER_DID);

      // Login should succeed even if profile fails
      expect(user.did).toBe(TEST_USER_DID);
      expect(renown.status).toBe("authorized");

      // Give time for background fetch to complete
      await new Promise((r) => setTimeout(r, 50));

      // Profile should remain undefined
      expect(renown.user?.profile).toBeUndefined();
    });

    it("should not update user if they logged out before profile returns", async () => {
      const credential = createMockCredential(TEST_USER_DID, appDid);

      // Make profile fetch slow
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/auth/credential")) {
          return Response.json({ credential });
        }
        if (url.includes("/api/profile")) {
          await new Promise((r) => setTimeout(r, 100));
          return Response.json({ profile: MOCK_PROFILE });
        }
        return new Response(null, { status: 404 });
      });

      await renown.login(TEST_USER_DID);
      await renown.logout();

      // Wait for slow profile fetch to resolve
      await new Promise((r) => setTimeout(r, 200));

      // User should remain undefined after logout
      expect(renown.user).toBeUndefined();
    });
  });

  describe("login errors", () => {
    it("should throw when credential is not found", async () => {
      mockFetch({ credential: null, credentialStatus: 404 });

      await expect(renown.login(TEST_USER_DID)).rejects.toThrow(
        "Failed to get credential: 404",
      );
      expect(renown.status).toBe("not-authorized");
      expect(renown.user).toBeUndefined();
    });

    it("should throw when credential issuer does not match userDid", async () => {
      const credential = createMockCredential(
        "did:pkh:eip155:1:0xDEADBEEF",
        appDid,
      );
      mockFetch({ credential });

      await expect(renown.login(TEST_USER_DID)).rejects.toThrow(
        "Invalid credential",
      );
      expect(renown.status).toBe("not-authorized");
    });

    it("should throw when credential subject does not match app DID", async () => {
      const credential = createMockCredential(TEST_USER_DID, "did:key:wrong");
      mockFetch({ credential });

      await expect(renown.login(TEST_USER_DID)).rejects.toThrow(
        "Invalid credential",
      );
      expect(renown.status).toBe("not-authorized");
    });

    it("should throw for invalid DID format", async () => {
      await expect(renown.login("invalid-did")).rejects.toThrow(
        "Invalid pkh did",
      );
      expect(renown.status).toBe("not-authorized");
    });

    it("should emit status and user events on failure", async () => {
      mockFetch({ credential: null, credentialStatus: 404 });

      const statuses: LoginStatus[] = [];
      const users: (User | undefined)[] = [];
      renown.on("status", (s) => statuses.push(s));
      renown.on("user", (u) => users.push(u));

      await expect(renown.login(TEST_USER_DID)).rejects.toThrow();

      expect(statuses).toEqual(["checking", "not-authorized"]);
      expect(users).toEqual([undefined]);
    });
  });

  describe("logout", () => {
    it("should clear user and set status to not-authorized", async () => {
      const credential = createMockCredential(TEST_USER_DID, appDid);
      mockFetch({ credential });

      await renown.login(TEST_USER_DID);
      expect(renown.user).toBeDefined();
      expect(renown.status).toBe("authorized");

      await renown.logout();

      expect(renown.user).toBeUndefined();
      expect(renown.status).toBe("initial");
    });

    it("should emit user and status events on logout", async () => {
      const credential = createMockCredential(TEST_USER_DID, appDid);
      mockFetch({ credential });

      await renown.login(TEST_USER_DID);

      const statuses: LoginStatus[] = [];
      const users: (User | undefined)[] = [];
      renown.on("status", (s) => statuses.push(s));
      renown.on("user", (u) => users.push(u));

      await renown.logout();

      expect(statuses).toEqual(["initial"]);
      expect(users).toEqual([undefined]);
    });
  });

  describe("event subscriptions", () => {
    it("should return unsubscribe function from on()", async () => {
      const credential = createMockCredential(TEST_USER_DID, appDid);
      mockFetch({ credential });

      const statuses: LoginStatus[] = [];
      const unsubscribe = renown.on("status", (s) => statuses.push(s));

      await renown.login(TEST_USER_DID);
      expect(statuses).toEqual(["checking", "authorized"]);

      unsubscribe();

      await renown.logout();
      // Should not receive the "not-authorized" event after unsubscribe
      expect(statuses).toEqual(["checking", "authorized"]);
    });
  });
});
